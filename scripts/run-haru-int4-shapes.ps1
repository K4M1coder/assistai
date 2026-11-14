param([ValidateRange(10,180)][int]$TimeoutSeconds=90, [switch]$SmokeOnly, [switch]$ImportOnly)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$adapter='luid_0x00000000_0x00013269_phys_0'
. (Join-Path $PSScriptRoot 'get-probe-gpu-memory.ps1')
. (Join-Path $PSScriptRoot 'haru-shape-guard.ps1')
$shapes=@('1024x2560','2560x4096','4096x2560','8192x2560','2560x9216','9216x2560')
if($SmokeOnly -or $ImportOnly){$shapes=@('32x2560')}
function Sample([int]$probeProcessId=0) {
  $counters=@((Get-Counter -Counter "\GPU Adapter Memory($adapter)\Dedicated Usage", "\GPU Adapter Memory($adapter)\Shared Usage").CounterSamples)
  $dedicated=@($counters | Where-Object Path -like '*\dedicated usage'); $shared=@($counters | Where-Object Path -like '*\shared usage')
  if($dedicated.Count -ne 1 -or $shared.Count -ne 1){throw 'GPU telemetry unavailable or ambiguous'}
  $busy=$false
  foreach($port in @(18080,18084)){
    $slots=@(Invoke-RestMethod "http://127.0.0.1:$port/slots" -TimeoutSec 3)
    if($slots.Count -ne 1 -or $slots[0].is_processing -ne $false){$busy=$true}
  }
  $probe=if($probeProcessId -gt 0){Get-ProbeGpuMemory $probeProcessId $adapter}else{$null}
  return @{at=[DateTimeOffset]::UtcNow.ToString('o');dedicatedBytes=[long]$dedicated[0].CookedValue;
    sharedBytes=[long]$shared[0].CookedValue;availableRamBytes=[long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory*1024;modelBusy=$busy;probeGpu=$probe}
}
$runtime=Join-Path $root '.cache/assistant'
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$prefix=Join-Path $runtime "haru-int4-shapes-$stamp"
$python=Join-Path $root '.cache/haru-xpu-env/Scripts/python.exe'
if(!(Test-Path -LiteralPath $python)){throw 'Isolated XPU Python is unavailable'}
$env:ASSISTAI_SHAPE_WATCHDOG='1'
foreach($shape in $shapes){
  $sample=Sample
  $extraShared=if($ImportOnly){0}else{96MB}
  Assert-HaruShapeSample $sample 10GB $extraShared
  $sample | ConvertTo-Json -Compress | Add-Content -LiteralPath "$prefix.samples.jsonl" -Encoding utf8
  $arguments=@('-u',(Join-Path $root 'scripts/probe-haru-int4-shape.py'),'--shape',$shape)
  if($ImportOnly){$arguments+=@('--import-only')}
  elseif($SmokeOnly){$arguments+=@('--hold-after','5')}
  $process=Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$prefix.$shape.stdout" -RedirectStandardError "$prefix.$shape.stderr" -PassThru
  $null=$process.Handle; $deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds); $reason='timeout'
  try {
    while([DateTime]::UtcNow -lt $deadline){
      $process.Refresh(); if($process.HasExited){$reason=if($process.ExitCode -eq 0){'passed'}else{"exit $($process.ExitCode)"};break}
      try {
        $sample=Sample $process.Id
        $sample | ConvertTo-Json -Compress -Depth 5 | Add-Content -LiteralPath "$prefix.samples.jsonl" -Encoding utf8
        Assert-HaruShapeSample $sample 8GB
      } catch { $reason=$_.Exception.Message; break }
    }
  } finally {
    $process.Refresh()
    if(!$process.HasExited){
      # Windows venv Python can launch the base interpreter as a child.
      & taskkill.exe /PID $process.Id /T /F 2>&1 | Out-Null
      $process.WaitForExit()
    }
  }
  @{shape=$shape;reason=$reason;stdout="$prefix.$shape.stdout";stderr="$prefix.$shape.stderr";samples="$prefix.samples.jsonl"}|ConvertTo-Json -Compress
  if($reason -ne 'passed'){exit 1}
}
