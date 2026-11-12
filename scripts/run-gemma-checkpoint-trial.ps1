param(
  [Parameter(Mandatory=$true)][ValidateSet(0,32)][int]$Checkpoints,
  [int]$TimeoutSeconds = 180
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$engine = Join-Path $env:USERPROFILE '.lmstudio/extensions/backends/llama.cpp-win-x86_64-vulkan-avx2-2.71.0/llama-server.exe'
$folder = Join-Path $env:USERPROFILE '.lmstudio/models/lmstudio-community/gemma-4-12B-it-QAT-GGUF'
$model = Join-Path $folder 'gemma-4-12B-it-QAT-Q4_0.gguf'
$projector = Join-Path $folder 'mmproj-gemma-4-12B-it-QAT-BF16.gguf'
foreach ($file in @($engine,$model,$projector)) { if (!(Test-Path -LiteralPath $file)) { throw "Missing: $file" } }
# Never stop or replace the user's running agent server automatically.
if (Get-NetTCPConnection -LocalPort 18080,18093 -State Listen -ErrorAction SilentlyContinue) { throw 'Agent or trial port in use; no process was stopped' }
$adapter='luid_0x00000000_0x00013269_phys_0'
function Sample-Resources($process) {
  $counters=@((Get-Counter -Counter "\GPU Adapter Memory($adapter)\Dedicated Usage", "\GPU Adapter Memory($adapter)\Shared Usage").CounterSamples)
  $dedicated=@($counters | Where-Object Path -like '*\dedicated usage')
  $shared=@($counters | Where-Object Path -like '*\shared usage')
  if($dedicated.Count -ne 1 -or $shared.Count -ne 1){throw 'GPU telemetry unavailable or ambiguous'}
  $p = if ($null -ne $process) { Get-Process -Id $process.Id -ErrorAction SilentlyContinue } else { $null }
  return @{ at=[DateTimeOffset]::UtcNow.ToString('o'); dedicatedBytes=[long]$dedicated[0].CookedValue; sharedBytes=[long]$shared[0].CookedValue; availableRamBytes=[long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory*1024; processWorkingSetBytes=if($p){$p.WorkingSet64}else{$null}; processPrivateBytes=if($p){$p.PrivateMemorySize64}else{$null}; pagefiles=@(Get-CimInstance Win32_PageFileUsage | ForEach-Object { @{ currentMiB=$_.CurrentUsage; allocatedMiB=$_.AllocatedBaseSize } }) }
}
$baseline=Sample-Resources $null
if($baseline.availableRamBytes -lt 10GB -or $baseline.dedicatedBytes -gt 10GB){throw 'Insufficient preflight headroom'}
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$prefix=Join-Path $root ".cache/gemma-checkpoints-$Checkpoints-$stamp"
$env:GGML_VK_DISABLE_COOPMAT='1'
Remove-Item Env:GGML_VK_ALLOW_SYSMEM_FALLBACK -ErrorAction SilentlyContinue
$argsList=@('-m',$model,'--mmproj',$projector,'--host','127.0.0.1','--port','18093','-c','8192','-ngl','99','-np','1','-b','512','-ub','256','-fa','on','-ctk','q8_0','-ctv','q8_0','--load-mode','none','--no-host','--cache-ram','0','--ctx-checkpoints',"$Checkpoints")
$server=$null; $probe=$null; $reason='not started'
try {
  $server=Start-Process -FilePath $engine -ArgumentList $argsList -WindowStyle Hidden -RedirectStandardOutput "$prefix.server.stdout" -RedirectStandardError "$prefix.server.stderr" -PassThru
  $null=$server.Handle
  $deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while([DateTime]::UtcNow -lt $deadline){
    $server.Refresh(); if($server.HasExited){throw 'Model server exited'}
    $sample=Sample-Resources $server
    ($sample | ConvertTo-Json -Compress -Depth 5) | Add-Content -LiteralPath "$prefix.samples.jsonl" -Encoding utf8
    if($sample.availableRamBytes -lt 6GB){throw 'RAM reserve'}
    if($sample.dedicatedBytes -gt 22GB){throw 'Dedicated GPU threshold'}
    if($sample.sharedBytes-$baseline.sharedBytes -gt 256MB){throw 'Shared GPU growth threshold'}
    if($null -eq $probe){
      try { $ready=(Invoke-RestMethod -Uri 'http://127.0.0.1:18093/health' -TimeoutSec 2).status -eq 'ok' } catch { $ready=$false }
      if($ready){
        $env:LOCAL_MODEL_URL='http://127.0.0.1:18093/v1'
        $probe=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @((Join-Path $root 'scripts/probe-local-model.mjs')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$prefix.probe.stdout" -RedirectStandardError "$prefix.probe.stderr" -PassThru
        $null=$probe.Handle
      }
    } else {
      $probe.Refresh()
      if($probe.HasExited){$reason=if($probe.ExitCode -eq 0){'tool-call probe passed'}else{"probe failed: $($probe.ExitCode)"};break}
    }
  }
  if($reason -eq 'not started'){throw 'Trial timed out'}
} catch { $reason=$_.Exception.Message }
finally {
  foreach($p in @($probe,$server)){if($null -ne $p){$p.Refresh();if(!$p.HasExited){Stop-Process -Id $p.Id -Force;$p.WaitForExit()}}}
}
@{ reason=$reason; checkpoints=$Checkpoints; baseline=$baseline; samples="$prefix.samples.jsonl"; serverStderr="$prefix.server.stderr"; probeStdout="$prefix.probe.stdout" } | ConvertTo-Json -Compress -Depth 5
if($reason -ne 'tool-call probe passed'){exit 1}
