param([switch]$PreflightOnly, [switch]$Arithmetic, [ValidateRange(10, 300)][int]$TimeoutSeconds = 120)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$adapter = 'luid_0x00000000_0x00013269_phys_0'
. (Join-Path $PSScriptRoot 'get-demo-ports.ps1')
function Read-Sample {
  $counters = @((Get-Counter -Counter "\GPU Adapter Memory($adapter)\Dedicated Usage", "\GPU Adapter Memory($adapter)\Shared Usage").CounterSamples)
  $dedicated = @($counters | Where-Object Path -like '*\dedicated usage')
  $shared = @($counters | Where-Object Path -like '*\shared usage')
  if ($dedicated.Count -ne 1 -or $shared.Count -ne 1) { throw 'GPU telemetry unavailable or ambiguous' }
  $demoPorts = @(Get-DemoPorts (Join-Path $root '.cache/assistant'))
  $connections = @(Get-NetTCPConnection -LocalPort $demoPorts -State Established -ErrorAction SilentlyContinue)
  return @{ at=[DateTimeOffset]::UtcNow.ToString('o'); dedicatedBytes=[long]$dedicated[0].CookedValue; sharedBytes=[long]$shared[0].CookedValue;
    availableRamBytes=[long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory*1024; demoConnections=$connections.Count }
}
function Assert-Sample($sample, [long]$minimumRam) {
  if ($sample.demoConnections -ne 0) { throw 'Demo has active connections' }
  if ($sample.availableRamBytes -lt $minimumRam -or $sample.dedicatedBytes -gt 22GB -or $sample.sharedBytes -gt 256MB) { throw 'Resource guard rejected the sample' }
}
$initial = Read-Sample
Assert-Sample $initial 10GB
$slots = @(Invoke-RestMethod 'http://127.0.0.1:18084/slots' -TimeoutSec 3)
if ($slots.Count -ne 1 -or $slots[0].is_processing -ne $false) { throw 'Controller slot is busy or unavailable' }
if ($PreflightOnly) { $initial | ConvertTo-Json -Compress; return }

$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$prefix = Join-Path $root ".cache/assistant/controller-baseline-$stamp"
$env:LOCAL_MODEL_URL = 'http://127.0.0.1:18084/v1'
$probeName=if($Arithmetic){'scripts/probe-controller-arithmetic.mjs'}else{'scripts/probe-controller-delegation.mjs'}
$probe = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @((Join-Path $root $probeName)) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$prefix.stdout" -RedirectStandardError "$prefix.stderr" -PassThru
$null = $probe.Handle
$reason = 'timeout'
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
try {
  while ([DateTime]::UtcNow -lt $deadline) {
    $sample = Read-Sample
    $sample | ConvertTo-Json -Compress | Add-Content -LiteralPath "$prefix.samples.jsonl" -Encoding utf8
    try { Assert-Sample $sample 8GB } catch { $reason = $_.Exception.Message; break }
    $probe.Refresh()
    if ($probe.HasExited) { $reason = if ($probe.ExitCode -eq 0) { 'structural checks passed; semantic review required' } else { "probe failed: $($probe.ExitCode)" }; break }
  }
} finally {
  $probe.Refresh()
  if (!$probe.HasExited) { Stop-Process -Id $probe.Id -Force; $probe.WaitForExit() }
}
@{ reason=$reason; baseline=$initial; samples="$prefix.samples.jsonl"; stdout="$prefix.stdout"; stderr="$prefix.stderr" } | ConvertTo-Json -Compress -Depth 4
if ($reason -ne 'structural checks passed; semantic review required') { exit 1 }
