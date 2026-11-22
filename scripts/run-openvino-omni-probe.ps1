param([int]$TimeoutSeconds=120,[switch]$Infer,[switch]$PreflightOnly)
$ErrorActionPreference='Stop'
if($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 300){throw 'Invalid timeout'}
$root=Split-Path -Parent $PSScriptRoot
$adapter='luid_0x00000000_0x00013269_phys_0'
function Resources {
  $c=@((Get-Counter -Counter "\GPU Adapter Memory($adapter)\Dedicated Usage","\GPU Adapter Memory($adapter)\Shared Usage").CounterSamples)
  $d=@($c|Where-Object Path -like '*\dedicated usage');$s=@($c|Where-Object Path -like '*\shared usage')
  if($d.Count -ne 1 -or $s.Count -ne 1){throw 'GPU telemetry unavailable'}
  @{at=[DateTimeOffset]::UtcNow.ToString('o');dedicated=[long]$d[0].CookedValue;shared=[long]$s[0].CookedValue;availableRam=[long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory*1024}
}
$base=Resources
$allowed=$base.availableRam -ge 10GB -and $base.dedicated -le 18GB -and $base.shared -le 128MB
if($PreflightOnly -or !$allowed){@{allowed=$allowed;baseline=$base}|ConvertTo-Json -Compress;if(!$allowed){exit 1};exit 0}
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff');$prefix=Join-Path $root ".cache/assistant/openvino-omni-$stamp"
$argsList=@((Join-Path $root 'scripts/probe-openvino-omni.py'));if($Infer){$argsList+=@('--infer','--output',"$prefix.wav")}
$env:HF_HUB_OFFLINE='1';$env:HF_HUB_DISABLE_TELEMETRY='1';$env:PYTHONIOENCODING='utf-8'
$p=Start-Process -FilePath (Join-Path $root '.cache/lfm3-openvino-research-py312/Scripts/python.exe') -ArgumentList $argsList -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$prefix.stdout" -RedirectStandardError "$prefix.stderr" -PassThru
$null=$p.Handle;$reason='timeout';$deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
try {
  while([DateTime]::UtcNow -lt $deadline){
    try {$s=Resources} catch {$reason='telemetry unavailable';break}
    ($s|ConvertTo-Json -Compress)|Add-Content -LiteralPath "$prefix.samples.jsonl" -Encoding utf8
    if($s.availableRam -lt 6GB -or $s.dedicated -gt 22GB -or $s.shared -gt 256MB){$reason='resource threshold';break}
    $p.Refresh();if($p.HasExited){$reason=if($p.ExitCode -eq 0){'probe completed'}else{"probe failed: $($p.ExitCode)"};break}
  }
} finally {$p.Refresh();if(!$p.HasExited){& taskkill.exe /PID $p.Id /T /F | Out-Null;$p.WaitForExit()}}
@{reason=$reason;baseline=$base;logs=$prefix}|ConvertTo-Json -Compress
if($reason -ne 'probe completed'){exit 1}
