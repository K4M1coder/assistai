param([int]$TimeoutSeconds=120,[switch]$Agent)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$engine=Join-Path $env:USERPROFILE '.lmstudio/extensions/backends/llama.cpp-win-x86_64-vulkan-avx2-2.71.0/llama-server.exe'
$model=if($Agent){Join-Path $env:USERPROFILE '.lmstudio/models/lmstudio-community/gemma-4-12B-it-QAT-GGUF/gemma-4-12B-it-QAT-Q4_0.gguf'}else{Join-Path $env:USERPROFILE '.lmstudio/models/LiquidAI/LFM3-1.7B-GGUF/LFM3-1.7B-Q8_0.gguf'}
$projector=if($Agent){Join-Path $env:USERPROFILE '.lmstudio/models/lmstudio-community/gemma-4-12B-it-QAT-GGUF/mmproj-gemma-4-12B-it-QAT-BF16.gguf'}else{$null}
$name=if($Agent){'agent-model'}else{'controller'}; $port=if($Agent){18080}else{18084}; $context=if($Agent){8192}else{4096}
$record=Join-Path $root ".cache/assistant/$name-process.json"
$adapter='luid_0x00000000_0x00013269_phys_0'
if($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 600){throw 'Invalid timeout'}
foreach($path in @($engine,$model)){if(!(Test-Path -LiteralPath $path)){throw "Required local dependency missing: $path"}}
if($Agent -and !(Test-Path -LiteralPath $projector)){throw "Required local dependency missing: $projector"}
if(Test-Path -LiteralPath $record){throw 'Controller ownership record exists'}
if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw 'Model port is occupied'}
function Resources {
  $c=@((Get-Counter -Counter "\GPU Adapter Memory($adapter)\Dedicated Usage","\GPU Adapter Memory($adapter)\Shared Usage").CounterSamples)
  $d=@($c | Where-Object Path -like '*\dedicated usage');$s=@($c | Where-Object Path -like '*\shared usage')
  if($d.Count -ne 1 -or $s.Count -ne 1){throw 'GPU telemetry unavailable'}
  return @{at=[DateTimeOffset]::UtcNow.ToString('o');dedicated=[long]$d[0].CookedValue;shared=[long]$s[0].CookedValue;availableRam=[long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory*1024}
}
$baseline=Resources
if($baseline.availableRam -lt $(if($Agent){10GB}else{8GB}) -or $baseline.dedicated -gt $(if($Agent){10GB}else{19GB}) -or $baseline.shared + $(if($Agent){96MB}else{64MB}) -gt 256MB){throw 'Insufficient sampled preflight headroom'}
$null=New-Item -ItemType Directory -Path (Split-Path -Parent $record) -Force
$env:GGML_VK_DISABLE_COOPMAT='1'
Remove-Item Env:GGML_VK_ALLOW_SYSMEM_FALLBACK -ErrorAction SilentlyContinue
$argsList=@('-m',$model); if($Agent){$argsList+=@('--mmproj',$projector)}
$argsList+=@('--host','127.0.0.1','--port',"$port",'-c',"$context",'-ngl','99','-np','1','-b','512','-ub','256','-fa','on','-ctk','q8_0','-ctv','q8_0','--load-mode','none','--no-host','--cache-ram','0')
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$process=$null; $samples=Join-Path $root ".cache/assistant/$name-start-$stamp.samples.jsonl"
try {
  $process=Start-Process -FilePath $engine -ArgumentList $argsList -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root ".cache/assistant/$name.stdout") -RedirectStandardError (Join-Path $root ".cache/assistant/$name.stderr") -PassThru
  $null=$process.Handle; $deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds);$ready=$false
  do {
    $process.Refresh();if($process.HasExited){throw 'Controller exited during startup'}
    $sample=Resources; ($sample | ConvertTo-Json -Compress) | Add-Content -LiteralPath $samples -Encoding utf8
    if($sample.availableRam -lt 6GB -or $sample.dedicated -gt 22GB -or $sample.shared -gt 256MB){throw 'Sampled startup resource threshold exceeded'}
    try {$health=Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 2; $ready=$health.status -eq 'ok'} catch {$ready=$false}
    if(!$ready){Start-Sleep -Milliseconds 300}
  } until($ready -or [DateTime]::UtcNow -gt $deadline)
  if(!$ready){throw 'Controller readiness timed out'}
  $listener=Get-NetTCPConnection -LocalPort $port -State Listen
  if($listener.Count -ne 1 -or $listener.OwningProcess -ne $process.Id){throw 'Controller listener ownership mismatch'}
  $info=Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
  @{id=$process.Id;started=$process.StartTime.ToUniversalTime().ToString('o');command=$info.CommandLine} | ConvertTo-Json -Compress | Set-Content -LiteralPath $record -Encoding utf8
  @{status='ready';port=$port;baseline=$baseline;samples=$samples;record=$record;hardLimitEnforced=$false} | ConvertTo-Json -Compress
} catch {
  if($process){$process.Refresh();if(!$process.HasExited){$process.Kill();$process.WaitForExit()}}
  throw
}
