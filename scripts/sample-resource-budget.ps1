param(
    [Parameter(Mandatory = $true)][int[]]$ModelPid,
    [Nullable[long]]$BaselineSharedBytes = $null
)

# Windows WDDM accounting snapshot. This is monitoring, not a reservation or
# proof that weights have remained resident in dedicated GPU memory.
$ErrorActionPreference = 'Stop'
$queries = @('\GPU Adapter Memory(*)\Dedicated Usage', '\GPU Adapter Memory(*)\Shared Usage')
foreach ($id in $ModelPid) {
    $null = Get-Process -Id $id -ErrorAction Stop
    $queries += "\GPU Process Memory(pid_$id*)\Dedicated Usage"
    $queries += "\GPU Process Memory(pid_$id*)\Shared Usage"
}
$samples = @((Get-Counter -Counter $queries).CounterSamples)
$processSamples = @($samples | Where-Object { $_.Path -match 'gpu process memory\(pid_\d+_(luid_[^\)]+)\)' })
foreach ($id in $ModelPid) {
    if (-not @($processSamples | Where-Object { $_.Path -like "*gpu process memory(pid_$($id)_*" -and $_.CookedValue -gt 0 }).Count) {
        throw "No nonzero GPU memory counters for model process $id."
    }
}
$adapters = @($processSamples | Where-Object { $_.CookedValue -gt 0 } | ForEach-Object {
    if ($_.Path -match 'gpu process memory\(pid_\d+_(luid_[^\)]+)\)') { $Matches[1] }
} | Select-Object -Unique)
if ($adapters.Count -ne 1) { throw "Expected one active adapter shared by model processes; found $($adapters.Count)." }
$adapter = $adapters[0]
$adapterSamples = @($samples | Where-Object { $_.Path -like "*gpu adapter memory($adapter)*" })
$dedicated = @($adapterSamples | Where-Object { $_.Path -like '*\dedicated usage' })
$shared = @($adapterSamples | Where-Object { $_.Path -like '*\shared usage' })
if ($dedicated.Count -ne 1 -or $shared.Count -ne 1) { throw 'Adapter counters missing or ambiguous.' }
$os = Get-CimInstance Win32_OperatingSystem
$available = [long]$os.FreePhysicalMemory * 1024
$pagefiles = @(Get-CimInstance Win32_PageFileUsage | ForEach-Object { @{ current_mib = $_.CurrentUsage; allocated_mib = $_.AllocatedBaseSize } })
$sharedBytes = [long]$shared[0].CookedValue
$warnings = @()
if ($available -lt 6GB) { $warnings += 'Available physical RAM is below the 6 GiB reserve.' }
if ([long]$dedicated[0].CookedValue -gt 22GB) { $warnings += 'Dedicated GPU usage exceeds the 22 GiB planning threshold.' }
if ($null -eq $BaselineSharedBytes) { $warnings += 'No pre-load shared GPU baseline; shared-memory growth cannot be assessed.' }
elseif ($sharedBytes - $BaselineSharedBytes -gt 256MB) { $warnings += 'Shared GPU memory growth exceeds 256 MiB.' }
@{
    observed_at_utc = [DateTimeOffset]::UtcNow.ToString('o')
    adapter = $adapter
    adapter_dedicated_bytes = [long]$dedicated[0].CookedValue
    adapter_shared_bytes = $sharedBytes
    baseline_shared_bytes = $BaselineSharedBytes
    available_physical_bytes = $available
    pagefiles = $pagefiles
    model_process_counters = @($processSamples | ForEach-Object { @{ path = $_.Path; bytes = [long]$_.CookedValue } })
    warnings = $warnings
    note = 'Snapshot only; no allocation control, peak guarantee, or proof of paging.'
} | ConvertTo-Json -Depth 6 -Compress
