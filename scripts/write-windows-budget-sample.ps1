param(
  [Parameter(Mandatory=$true)][string]$Adapter,
  [Parameter(Mandatory=$true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$target = [IO.Path]::GetFullPath($OutputPath)
$temporary = "$target.tmp"
if (!(Test-Path -LiteralPath (Split-Path -Parent $target))) { throw 'Output directory does not exist' }
while ($true) {
  $samples = @((Get-Counter -Counter "\GPU Adapter Memory($Adapter)\Dedicated Usage", "\GPU Adapter Memory($Adapter)\Shared Usage").CounterSamples)
  $dedicated = @($samples | Where-Object Path -like '*\dedicated usage')
  $shared = @($samples | Where-Object Path -like '*\shared usage')
  if ($dedicated.Count -ne 1 -or $shared.Count -ne 1) { throw 'GPU counters missing or ambiguous' }
  $sample = @{
    observedAt = [DateTimeOffset]::UtcNow.ToString('o')
    dedicatedBytes = [long]$dedicated[0].CookedValue
    sharedBytes = [long]$shared[0].CookedValue
    availableRamBytes = [long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1024
  } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($temporary, $sample, [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $target -Force
}
