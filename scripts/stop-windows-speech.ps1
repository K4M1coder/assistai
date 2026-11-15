$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$recordPath=Join-Path $root '.cache/assistant/speech-processes.json'
if(!(Test-Path -LiteralPath $recordPath)){throw 'No speech ownership record'}
$record=Get-Content -Raw -LiteralPath $recordPath | ConvertFrom-Json
if(!$record.processes -or $record.processes.Count -lt 2){throw 'Invalid speech ownership record'}
$targets=@($record.processes)
$verified=[System.Collections.Generic.List[System.Diagnostics.Process]]::new()
foreach($target in $targets){
  if($target.id -le 0 -or !$target.started){throw 'Invalid speech ownership record'}
  $process=Get-Process -Id $target.id -ErrorAction SilentlyContinue
  if(!$process){continue}
  $info=Get-CimInstance Win32_Process -Filter "ProcessId=$($target.id)"
  if($process.StartTime.ToUniversalTime().Ticks -ne ([DateTime]$target.started).ToUniversalTime().Ticks -or $info.CommandLine -cne $target.command){throw "Process identity mismatch for $($target.id); nothing was stopped"}
  $null=$process.Handle; $verified.Add($process)
}
$ordered=$verified.ToArray(); [array]::Reverse($ordered)
foreach($process in $ordered){$process.Refresh();if(!$process.HasExited){$process.Kill();$process.WaitForExit()}}
Remove-Item -LiteralPath $recordPath
'Stopped owned speech services'
