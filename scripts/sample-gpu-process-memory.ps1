param(
  [Parameter(Mandatory=$true)][int[]]$ProcessId,
  [Parameter(Mandatory=$true)][string]$RunId,
  [int]$Seconds=60
)
$ErrorActionPreference='Stop'
if($RunId -notmatch '^[A-Za-z0-9_-]{1,40}$' -or $Seconds -lt 1 -or $Seconds -gt 120){throw 'Invalid run ID or duration'}
$root=Split-Path -Parent $PSScriptRoot
$output=Join-Path $root ".cache/assistant/gpu-process-$RunId.jsonl"
if(Test-Path -LiteralPath $output){throw 'Sample file already exists'}
$expected=@{}
foreach($id in ($ProcessId | Select-Object -Unique)){
  if($id -le 0){throw 'Process IDs must be positive'}
  $process=Get-Process -Id $id -ErrorAction Stop
  $expected[$id]=$process.StartTime.ToUniversalTime().Ticks
}
$file=New-Object System.IO.FileStream($output,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::Read)
$writer=New-Object System.IO.StreamWriter($file,[System.Text.UTF8Encoding]::new($false))
$count=0;$reason='duration elapsed';$deadline=[DateTime]::UtcNow.AddSeconds($Seconds)
try {
  while([DateTime]::UtcNow -lt $deadline){
    try {$sample=& (Join-Path $root 'scripts/snapshot-gpu-process-memory.ps1') -ProcessId $ProcessId | ConvertFrom-Json} catch {$reason="sample unavailable: $($_.Exception.Message)";break}
    $changed=@($sample.processes | Where-Object {$expected[[int]$_.pid] -ne ([datetime]$_.processStartUtc).ToUniversalTime().Ticks})
    if($changed.Count -ne 0){$reason='process identity changed';break}
    $writer.WriteLine(($sample|ConvertTo-Json -Compress -Depth 5));$writer.Flush();$count++
  }
} finally {$writer.Dispose()}
@{reason=$reason;samples=$count;output=$output}|ConvertTo-Json -Compress
if($reason -ne 'duration elapsed' -or $count -eq 0){exit 1}
