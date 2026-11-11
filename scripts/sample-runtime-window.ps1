param(
  [Parameter(Mandatory = $true)][string]$Adapter,
  [ValidateRange(1, 60)][int]$Seconds = 15
)
# Sample existing Windows adapter accounting; this is not a resource limit.
$ErrorActionPreference = 'Stop'
$deadline = [DateTimeOffset]::UtcNow.AddSeconds($Seconds)
$samples = @()
while ([DateTimeOffset]::UtcNow -lt $deadline) {
  $counters = @((Get-Counter -Counter "\GPU Adapter Memory($Adapter)\Dedicated Usage", "\GPU Adapter Memory($Adapter)\Shared Usage").CounterSamples)
  $dedicated = @($counters | Where-Object Path -like '*\dedicated usage')
  $shared = @($counters | Where-Object Path -like '*\shared usage')
  if ($dedicated.Count -ne 1 -or $shared.Count -ne 1) { throw 'GPU counters missing or ambiguous' }
  $samples += @{
    at = [DateTimeOffset]::UtcNow.ToString('o')
    dedicated_bytes = [long]$dedicated[0].CookedValue
    shared_bytes = [long]$shared[0].CookedValue
    available_physical_bytes = [long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1024
  }
  Start-Sleep -Milliseconds 250
}
@{ adapter = $Adapter; requested_seconds = $Seconds; samples = $samples;
   note = 'Whole-adapter snapshots; not per-model attribution, allocation limits or proof against paging.' } | ConvertTo-Json -Depth 4 -Compress
