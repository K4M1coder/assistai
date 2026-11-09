param(
  [Parameter(Mandatory = $true)][int]$ModelPid,
  [int]$Samples = 30,
  [int]$IntervalSeconds = 1
)

# GPU counters are WDDM accounting values, not direct proof that an individual
# allocation was evicted. Page-file usage is system-wide, not process-specific.
for ($i = 0; $i -lt $Samples; $i++) {
  $process = Get-Process -Id $ModelPid -ErrorAction Stop
  $gpuCounters = Get-Counter -Counter @(
    '\GPU Adapter Memory(*)\Dedicated Usage',
    '\GPU Adapter Memory(*)\Shared Usage',
    "\GPU Process Memory(pid_$ModelPid*)\Dedicated Usage",
    "\GPU Process Memory(pid_$ModelPid*)\Shared Usage"
  ) -ErrorAction Stop
  $os = Get-CimInstance Win32_OperatingSystem
  $pagefiles = @(Get-CimInstance Win32_PageFileUsage | ForEach-Object {
    @{ path = $_.Name; current_mib = $_.CurrentUsage; peak_mib = $_.PeakUsage; allocated_mib = $_.AllocatedBaseSize }
  })
  $gpu = @($gpuCounters.CounterSamples | ForEach-Object { @{ path = $_.Path; bytes = $_.CookedValue } })
  @{
    at = [DateTimeOffset]::UtcNow.ToString('o')
    model_pid = $ModelPid
    process_working_set_bytes = $process.WorkingSet64
    process_private_bytes = $process.PrivateMemorySize64
    available_physical_bytes = [long]$os.FreePhysicalMemory * 1024
    pagefiles = $pagefiles
    gpu = $gpu
  } | ConvertTo-Json -Depth 6 -Compress
  if ($i -lt $Samples - 1) { Start-Sleep -Seconds $IntervalSeconds }
}
