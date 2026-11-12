param([int]$Port=18089)
$ErrorActionPreference='Stop'
if($Port -lt 1024 -or $Port -gt 65535){throw 'Invalid port'}
$root=Split-Path -Parent $PSScriptRoot
$recordPath=Join-Path $root ".cache/assistant/demo-$Port-processes.json"
if(!(Test-Path -LiteralPath $recordPath)){throw 'No ownership record for this demo'}
$record=Get-Content -Raw -LiteralPath $recordPath | ConvertFrom-Json
if($record.port -ne $Port){throw 'Ownership record does not match port'}
$targets=@(
  @{id=[int]$record.gatewayPid;started=$record.gatewayStartedUtc;pattern='*prototype*gateway.mjs*'},
  @{id=[int]$record.samplerPid;started=$record.samplerStartedUtc;pattern='*write-windows-budget-sample.ps1*'}
)
$verified=[System.Collections.Generic.List[System.Diagnostics.Process]]::new()
foreach($target in $targets){
  if($target.id -le 0 -or !$target.started){throw 'Invalid ownership record'}
  $process=Get-Process -Id $target.id -ErrorAction SilentlyContinue
  if(!$process){continue}
  $info=Get-CimInstance Win32_Process -Filter "ProcessId=$($target.id)"
  $recordedStart=([DateTime]$target.started).ToUniversalTime()
  if($process.StartTime.ToUniversalTime().Ticks -ne $recordedStart.Ticks -or $info.CommandLine -notlike $target.pattern){throw "Process identity mismatch for $($target.id); nothing was stopped"}
  $null=$process.Handle
  $verified.Add($process)
}
foreach($process in $verified){
  $process.Refresh()
  if(!$process.HasExited){$process.Kill();$process.WaitForExit()}
}
Remove-Item -LiteralPath $recordPath
"Stopped owned demo on port $Port"
