function Select-ProbeGpuCounters($CounterSamples, [int[]]$ProcessIds, [string]$Adapter) {
  $result=@()
  foreach($item in $CounterSamples){
    if($item.InstanceName -notmatch '^pid_(\d+)_(.+)$'){continue}
    $processIdValue=[int]$Matches[1]; $adapterValue=$Matches[2]
    if($processIdValue -notin $ProcessIds -or $adapterValue -ne $Adapter){continue}
    if($item.Path -match '\\dedicated usage$'){$kind='dedicatedBytes'}
    elseif($item.Path -match '\\shared usage$'){$kind='sharedBytes'}
    else{continue}
    $result+=@{pid=$processIdValue;kind=$kind;bytes=[long]$item.CookedValue}
  }
  return $result
}

function Get-ProbeGpuMemory([int]$RootProcessId,[string]$Adapter) {
  try {
    $ids=[System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add($RootProcessId)
    $pending=[System.Collections.Generic.Queue[int]]::new(); $pending.Enqueue($RootProcessId)
    while($pending.Count){
      $parentId=$pending.Dequeue()
      foreach($child in @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$parentId" -ErrorAction Stop)){
        if($ids.Add([int]$child.ProcessId)){$pending.Enqueue([int]$child.ProcessId)}
      }
    }
    $raw=(Get-Counter -Counter @('\GPU Process Memory(*)\Dedicated Usage','\GPU Process Memory(*)\Shared Usage') -ErrorAction Stop).CounterSamples
    $selected=@(Select-ProbeGpuCounters $raw @($ids) $Adapter)
    return @{status=if($selected.Count){'observed'}else{'not_observed'};counters=$selected}
  } catch { return @{status='unavailable';counters=@()} }
}
