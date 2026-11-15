param([switch]$Agent)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$name=if($Agent){'agent-model'}else{'controller'}
$recordPath=Join-Path $root ".cache/assistant/$name-process.json"
if(!(Test-Path -LiteralPath $recordPath)){throw 'No controller ownership record'}
$record=Get-Content -Raw -LiteralPath $recordPath | ConvertFrom-Json
if([int]$record.id -le 0 -or !$record.started -or !$record.command){throw 'Invalid controller ownership record'}
$process=Get-Process -Id $record.id -ErrorAction SilentlyContinue
if($process){
  $info=Get-CimInstance Win32_Process -Filter "ProcessId=$($record.id)"
  if($process.StartTime.ToUniversalTime().Ticks -ne ([DateTime]$record.started).ToUniversalTime().Ticks -or $info.CommandLine -cne $record.command){throw 'Controller identity mismatch; nothing was stopped'}
  $null=$process.Handle;$process.Kill();$process.WaitForExit()
}
Remove-Item -LiteralPath $recordPath
'Stopped owned controller'
