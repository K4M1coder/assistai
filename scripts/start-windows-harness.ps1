param([switch]$EditFixture,[switch]$WebFixture)
$ErrorActionPreference='Stop'
if($EditFixture -and $WebFixture){throw 'Choose one fixture'}
$root=Split-Path -Parent $PSScriptRoot
$exe=Join-Path $root 'node_modules/opencode-ai/bin/opencode.exe'
$workspace=Join-Path $root $(if($EditFixture){'.cache/agent-edit-demo'}elseif($WebFixture){'.cache/agent-web-demo'}else{'.cache/opencode-probe'})
$record=Join-Path $root $(if($EditFixture){'.cache/assistant/edit-harness-process.json'}elseif($WebFixture){'.cache/assistant/web-harness-process.json'}else{'.cache/assistant/harness-process.json'})
$port=if($EditFixture){18110}elseif($WebFixture){18120}else{18085};$expectedModel=if($EditFixture -or $WebFixture){'local/probe'}else{'local/qwen'}
$fixture=if($EditFixture){'calculator.py'}elseif($WebFixture){'README.txt'}else{'fixture.txt'}
foreach($path in @($exe,(Join-Path $workspace 'opencode.json'),(Join-Path $workspace $fixture))){if(!(Test-Path -LiteralPath $path)){throw "Required local dependency missing: $path"}}
$localConfig=Get-Content -Raw -LiteralPath (Join-Path $workspace 'opencode.json') | ConvertFrom-Json
if($localConfig.model -ne $expectedModel -or $localConfig.provider.local.options.baseURL -ne 'http://127.0.0.1:18080/v1' -or $localConfig.permission.'*' -ne 'deny'){throw 'Unexpected harness configuration'}
$allowed=@('read','glob','grep');if($EditFixture){$allowed+=@('edit');if($localConfig.permission.external_directory -ne 'deny' -or $localConfig.permission.edit -ne 'allow'){throw 'Edit fixture permissions are invalid'}}
if($WebFixture){$allowed=@('websearch','webfetch');if($localConfig.permission.external_directory -ne 'deny' -or $localConfig.permission.websearch -ne 'allow' -or $localConfig.permission.webfetch -ne 'allow'){throw 'Web fixture permissions are invalid'}}
foreach($rule in $localConfig.permission.PSObject.Properties){if($rule.Name -ne '*' -and $rule.Value -ne 'deny' -and $rule.Name -notin $allowed){throw "Unexpected harness permission: $($rule.Name)"}}
if(Test-Path -LiteralPath $record){throw 'Harness ownership record exists'}
if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw 'Harness port is occupied'}
$null=New-Item -ItemType Directory -Path (Split-Path -Parent $record) -Force
$process=$null
try {
  $name=if($EditFixture){'edit-harness'}elseif($WebFixture){'web-harness'}else{'harness'}
  $oldExa=[Environment]::GetEnvironmentVariable('OPENCODE_ENABLE_EXA','Process')
  $oldParallel=[Environment]::GetEnvironmentVariable('OPENCODE_ENABLE_PARALLEL','Process')
  try {
    if($WebFixture){$env:OPENCODE_ENABLE_EXA='1'}else{Remove-Item Env:OPENCODE_ENABLE_EXA -ErrorAction SilentlyContinue}
    Remove-Item Env:OPENCODE_ENABLE_PARALLEL -ErrorAction SilentlyContinue
    $process=Start-Process -FilePath $exe -ArgumentList @('serve','--hostname','127.0.0.1','--port',"$port") -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root ".cache/assistant/$name.stdout") -RedirectStandardError (Join-Path $root ".cache/assistant/$name.stderr") -PassThru
  } finally {
    if($null -eq $oldExa){Remove-Item Env:OPENCODE_ENABLE_EXA -ErrorAction SilentlyContinue}else{$env:OPENCODE_ENABLE_EXA=$oldExa}
    if($null -eq $oldParallel){Remove-Item Env:OPENCODE_ENABLE_PARALLEL -ErrorAction SilentlyContinue}else{$env:OPENCODE_ENABLE_PARALLEL=$oldParallel}
  }
  $null=$process.Handle; $deadline=[DateTime]::UtcNow.AddSeconds(30);$ready=$false
  do {
    $process.Refresh();if($process.HasExited){throw 'Harness exited during startup'}
    try {$config=Invoke-RestMethod "http://127.0.0.1:$port/config" -TimeoutSec 2; $ready=$config.model -eq $expectedModel} catch {$ready=$false}
    if(!$ready){Start-Sleep -Milliseconds 300}
  } until($ready -or [DateTime]::UtcNow -gt $deadline)
  if(!$ready){throw 'Harness readiness timed out'}
  $listener=@(Get-NetTCPConnection -LocalPort $port -State Listen)
  if($listener.Count -ne 1 -or $listener.OwningProcess -ne $process.Id){throw 'Harness listener ownership mismatch'}
  $info=Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
  @{id=$process.Id;started=$process.StartTime.ToUniversalTime().ToString('o');command=$info.CommandLine} | ConvertTo-Json -Compress | Set-Content -LiteralPath $record -Encoding utf8
  @{status='ready';port=$port;workspace=$workspace;record=$record;editFixture=[bool]$EditFixture;webFixture=[bool]$WebFixture} | ConvertTo-Json -Compress
} catch {if($process){$process.Refresh();if(!$process.HasExited){$process.Kill();$process.WaitForExit()}};throw}
