param([int]$TimeoutSeconds=60,[switch]$Overlap,[switch]$NaturalOverlap,[int]$EndSilenceMs=700,[switch]$NoExtraction,[switch]$OtherEnrollment,[switch]$BackgroundOnly)
$ErrorActionPreference='Stop'
if($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 120){throw 'Invalid timeout'}
if($Overlap -and $NaturalOverlap){throw 'Choose one overlap fixture'}
if($OtherEnrollment -and (!$NaturalOverlap -or $NoExtraction)){throw 'Other enrollment requires filtered natural overlap'}
if($BackgroundOnly -and (!$NaturalOverlap -or $OtherEnrollment)){throw 'Background control requires natural overlap and excludes other enrollment'}
if($EndSilenceMs -lt 200 -or $EndSilenceMs -gt 3000 -or $EndSilenceMs % 20 -ne 0){throw 'Invalid end silence'}
$root=Split-Path -Parent $PSScriptRoot
$adapter='luid_0x00000000_0x00013269_phys_0'
function Resources {
  $c=@((Get-Counter -Counter "\GPU Adapter Memory($adapter)\Dedicated Usage","\GPU Adapter Memory($adapter)\Shared Usage").CounterSamples)
  $d=@($c | Where-Object Path -like '*\dedicated usage');$s=@($c | Where-Object Path -like '*\shared usage')
  if($d.Count -ne 1 -or $s.Count -ne 1){throw 'GPU telemetry unavailable'}
  @{at=[DateTimeOffset]::UtcNow.ToString('o');dedicated=[long]$d[0].CookedValue;shared=[long]$s[0].CookedValue;availableRam=[long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory*1024}
}
$base=Resources
if($base.availableRam -lt 8GB -or $base.dedicated -gt 22GB -or $base.shared -gt 256MB){throw 'Insufficient preflight headroom'}
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff');$prefix=Join-Path $root ".cache/assistant/native-batched-extractor-$stamp"
$names=@('ASSISTAI_TEST_SPEAKER_ENROLLMENT','ASSISTAI_TEST_SPEAKER_CHUNK_MS','ASSISTAI_TEST_LEADING_SILENCE_FRAMES','ASSISTAI_TEST_FIXTURE','ASSISTAI_TEST_END_SILENCE_MS','ASSISTAI_TEST_RESPONSE_DELAY_MS','PYTHONIOENCODING')
$previous=@{};foreach($name in $names){$previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
  if($NoExtraction){Remove-Item Env:ASSISTAI_TEST_SPEAKER_ENROLLMENT -ErrorAction SilentlyContinue;$env:ASSISTAI_TEST_SPEAKER_CHUNK_MS='20'}
  else {$env:ASSISTAI_TEST_SPEAKER_ENROLLMENT=Join-Path $root $(if($OtherEnrollment){'.cache/mls-sidon-natural/native-other-enrollment-16k.wav'}elseif($NaturalOverlap){'.cache/mls-sidon-natural/native-enrollment-16k.wav'}else{'.cache/tse-enroll-batched-test-16k.wav'});$env:ASSISTAI_TEST_SPEAKER_CHUNK_MS='40'}
  $env:ASSISTAI_TEST_LEADING_SILENCE_FRAMES=if($Overlap -or $NaturalOverlap){'0'}else{'50'}
  $env:ASSISTAI_TEST_FIXTURE=if($BackgroundOnly){'natural-background'}elseif($OtherEnrollment){'natural-other'}elseif($NaturalOverlap){'natural-overlap'}elseif($Overlap){'overlap'}else{'question'}
  $env:ASSISTAI_TEST_END_SILENCE_MS=[string]$EndSilenceMs
  $env:ASSISTAI_TEST_RESPONSE_DELAY_MS=if($NaturalOverlap){'2000'}else{'0'}
  $env:PYTHONIOENCODING='utf-8'
  $p=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @((Join-Path $root 'scripts/probe-native-client-mock-gateway.mjs')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$prefix.stdout" -RedirectStandardError "$prefix.stderr" -PassThru
} finally {foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$previous[$name],'Process')}}
$null=$p.Handle;$reason='timeout';$deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
try {
  while([DateTime]::UtcNow -lt $deadline){
    try {$s=Resources} catch {$reason='telemetry unavailable';break}
    ($s|ConvertTo-Json -Compress)|Add-Content -LiteralPath "$prefix.samples.jsonl" -Encoding utf8
    if($s.availableRam -lt 6GB -or $s.dedicated -gt 22GB -or $s.shared -gt 256MB){$reason='resource threshold';break}
    $p.Refresh();if($p.HasExited){$reason=if($p.ExitCode -eq 0){'probe completed'}else{"probe failed: $($p.ExitCode)"};break}
  }
} finally {
  $p.Refresh();if(!$p.HasExited){& taskkill.exe /PID $p.Id /T /F | Out-Null;$p.WaitForExit()}
}
@{reason=$reason;baseline=$base;logs=$prefix}|ConvertTo-Json -Compress
if($reason -ne 'probe completed'){exit 1}
