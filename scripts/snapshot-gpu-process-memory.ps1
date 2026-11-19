param(
  [Parameter(Mandatory=$true)][int[]]$ProcessId,
  [string]$Adapter='luid_0x00000000_0x00013269_phys_0'
)
$ErrorActionPreference='Stop'
if($ProcessId.Count -eq 0 -or @($ProcessId | Where-Object {$_ -le 0}).Count -ne 0){throw 'Process IDs must be positive'}
if($Adapter -notmatch '^luid_0x[0-9a-fA-F]{8}_0x[0-9a-fA-F]{8}_phys_[0-9]+$'){throw 'Invalid adapter instance'}
$samples=@((Get-Counter '\GPU Process Memory(*)\Dedicated Usage','\GPU Process Memory(*)\Shared Usage').CounterSamples)
$observed=@()
foreach($id in ($ProcessId | Select-Object -Unique)){
  $instance="pid_${id}_${Adapter}".ToLowerInvariant()
  $dedicated=@($samples | Where-Object {$_.InstanceName -eq $instance -and $_.Path -like '*\dedicated usage'})
  $shared=@($samples | Where-Object {$_.InstanceName -eq $instance -and $_.Path -like '*\shared usage'})
  if($dedicated.Count -ne 1 -or $shared.Count -ne 1){throw "GPU counters missing or ambiguous for PID $id"}
  $process=Get-Process -Id $id -ErrorAction Stop
  $observed+=@{pid=$id;processName=$process.ProcessName;processStartUtc=$process.StartTime.ToUniversalTime().ToString('o');dedicatedBytes=[long]$dedicated[0].CookedValue;sharedBytes=[long]$shared[0].CookedValue}
}
@{observedAt=[DateTimeOffset]::UtcNow.ToString('o');adapter=$Adapter;processes=$observed;interpretation='Sampled process GPU counters; memory content and transient peaks are unknown.'}|ConvertTo-Json -Compress -Depth 4
