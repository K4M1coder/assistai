$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$exe=Join-Path $root 'node_modules/opencode-ai/bin/opencode.exe'
$workspace=Join-Path $root '.cache/opencode-probe'
$record=Join-Path $root '.cache/assistant/harness-process.json'
foreach($path in @($exe,(Join-Path $workspace 'opencode.json'),(Join-Path $workspace 'fixture.txt'))){if(!(Test-Path -LiteralPath $path)){throw "Required local dependency missing: $path"}}
$localConfig=Get-Content -Raw -LiteralPath (Join-Path $workspace 'opencode.json') | ConvertFrom-Json
if($localConfig.model -ne 'local/qwen' -or $localConfig.provider.local.options.baseURL -ne 'http://127.0.0.1:18080/v1' -or $localConfig.permission.'*' -ne 'deny'){throw 'Unexpected harness configuration'}
foreach($rule in $localConfig.permission.PSObject.Properties){if($rule.Name -ne '*' -and $rule.Value -ne 'deny' -and $rule.Name -notin @('read','glob','grep')){throw "Unexpected harness permission: $($rule.Name)"}}
if(Test-Path -LiteralPath $record){throw 'Harness ownership record exists'}
if(Get-NetTCPConnection -LocalPort 18085 -State Listen -ErrorAction SilentlyContinue){throw 'Harness port is occupied'}
$null=New-Item -ItemType Directory -Path (Split-Path -Parent $record) -Force
$process=$null
try {
  $process=Start-Process -FilePath $exe -ArgumentList @('serve','--hostname','127.0.0.1','--port','18085') -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root '.cache/assistant/harness.stdout') -RedirectStandardError (Join-Path $root '.cache/assistant/harness.stderr') -PassThru
  $null=$process.Handle; $deadline=[DateTime]::UtcNow.AddSeconds(30);$ready=$false
  do {
    $process.Refresh();if($process.HasExited){throw 'Harness exited during startup'}
    try {$config=Invoke-RestMethod http://127.0.0.1:18085/config -TimeoutSec 2; $ready=$config.model -eq 'local/qwen'} catch {$ready=$false}
    if(!$ready){Start-Sleep -Milliseconds 300}
  } until($ready -or [DateTime]::UtcNow -gt $deadline)
  if(!$ready){throw 'Harness readiness timed out'}
  $listener=Get-NetTCPConnection -LocalPort 18085 -State Listen
  if($listener.Count -ne 1 -or $listener.OwningProcess -ne $process.Id){throw 'Harness listener ownership mismatch'}
  $info=Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
  @{id=$process.Id;started=$process.StartTime.ToUniversalTime().ToString('o');command=$info.CommandLine} | ConvertTo-Json -Compress | Set-Content -LiteralPath $record -Encoding utf8
  @{status='ready';port=18085;workspace=$workspace;record=$record} | ConvertTo-Json -Compress
} catch {if($process){$process.Refresh();if(!$process.HasExited){$process.Kill();$process.WaitForExit()}};throw}
