param([switch]$EditFixture)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$recordPath=Join-Path $root $(if($EditFixture){'.cache/assistant/edit-harness-process.json'}else{'.cache/assistant/harness-process.json'})
if(!(Test-Path -LiteralPath $recordPath)){throw 'No harness ownership record'}
$record=Get-Content -Raw -LiteralPath $recordPath | ConvertFrom-Json
if([int]$record.id -le 0 -or !$record.started -or !$record.command){throw 'Invalid harness ownership record'}
$process=Get-Process -Id $record.id -ErrorAction SilentlyContinue
if($process){
  $info=Get-CimInstance Win32_Process -Filter "ProcessId=$($record.id)"
  if($process.StartTime.ToUniversalTime().Ticks -ne ([DateTime]$record.started).ToUniversalTime().Ticks -or $info.CommandLine -cne $record.command){throw 'Harness identity mismatch; nothing was stopped'}
  $null=$process.Handle;$process.Kill();$process.WaitForExit()
}
Remove-Item -LiteralPath $recordPath
'Stopped owned harness'
