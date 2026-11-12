param([int]$TimeoutSeconds = 90, [ValidateSet('mangue','rouge')][string]$Marker='mangue')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$adapter = 'luid_0x00000000_0x00013269_phys_0'
function Resources {
  $c=@((Get-Counter -Counter "\GPU Adapter Memory($adapter)\Dedicated Usage", "\GPU Adapter Memory($adapter)\Shared Usage").CounterSamples)
  $d=@($c | Where-Object Path -like '*\dedicated usage'); $s=@($c | Where-Object Path -like '*\shared usage')
  if($d.Count -ne 1 -or $s.Count -ne 1){throw 'GPU telemetry unavailable'}
  return @{ at=[DateTimeOffset]::UtcNow.ToString('o'); dedicated=[long]$d[0].CookedValue; shared=[long]$s[0].CookedValue; availableRam=[long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory*1024 }
}
$base=Resources
if($base.availableRam -lt 8GB -or $base.dedicated -gt 22GB){throw 'Insufficient preflight headroom'}
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$prefix=Join-Path $root ".cache/notification-transcription-$stamp"
$python=Join-Path $root '.venv-voice/Scripts/python.exe'
$env:PYTHONIOENCODING='utf-8'
$p=Start-Process -FilePath $python -ArgumentList @((Join-Path $root 'scripts/probe-notification-transcription.py'),'--marker',$Marker) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$prefix.stdout" -RedirectStandardError "$prefix.stderr" -PassThru
$null=$p.Handle
$deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds); $reason='timeout'
try {
  while([DateTime]::UtcNow -lt $deadline){
    $sample=Resources
    ($sample | ConvertTo-Json -Compress) | Add-Content -LiteralPath "$prefix.samples.jsonl" -Encoding utf8
    if($sample.availableRam -lt 6GB){$reason='RAM reserve';break}
    if($sample.dedicated -gt 22GB){$reason='dedicated GPU threshold';break}
    if($sample.shared-$base.shared -gt 256MB){$reason='shared GPU growth threshold';break}
    $p.Refresh(); if($p.HasExited){$reason=if($p.ExitCode -eq 0){'probe passed'}else{"probe failed: $($p.ExitCode)"};break}
  }
} finally {
  $p.Refresh()
  if(!$p.HasExited){
    # Only terminate the gateway child spawned by this owned probe, then the probe itself.
    $children=@(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*prototype*gateway.mjs*' })
    foreach($child in $children){Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue}
    Stop-Process -Id $p.Id -Force; $p.WaitForExit()
  }
}
@{ reason=$reason; baseline=$base; samples="$prefix.samples.jsonl"; stdout="$prefix.stdout"; stderr="$prefix.stderr" } | ConvertTo-Json -Compress
if($reason -ne 'probe passed'){exit 1}
