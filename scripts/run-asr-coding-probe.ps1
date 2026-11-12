param([int]$TimeoutSeconds=180, [switch]$CompareCrisp)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$adapter='luid_0x00000000_0x00013269_phys_0'
function Resources {
  $c=@((Get-Counter -Counter "\GPU Adapter Memory($adapter)\Dedicated Usage","\GPU Adapter Memory($adapter)\Shared Usage").CounterSamples)
  $d=@($c | Where-Object Path -like '*\dedicated usage'); $s=@($c | Where-Object Path -like '*\shared usage')
  if($d.Count -ne 1 -or $s.Count -ne 1){throw 'GPU telemetry unavailable'}
  return @{at=[DateTimeOffset]::UtcNow.ToString('o');dedicated=[long]$d[0].CookedValue;shared=[long]$s[0].CookedValue;availableRam=[long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory*1024}
}
$base=Resources
if($base.availableRam -lt 8GB -or $base.dedicated -gt 22GB -or $base.shared -gt 256MB){throw 'Insufficient preflight headroom'}
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff');$prefix=Join-Path $root ".cache/asr-coding-$stamp"
$env:PYTHONIOENCODING='utf-8'
$probeArgs=@((Join-Path $root 'scripts/probe-asr-coding.py'))
$crisp=Join-Path $root '.cache/crispasr-v0.8.53-windows-cpu/crispasr-windows-x86_64-cpu/crispasr.exe'
$model=Join-Path $env:USERPROFILE '.lmstudio/models/cstr/stt-fr-fastconformer-hybrid-ctc-large-GGUF/stt-fr-fastconformer-hybrid-ctc-large-q8_0.gguf'
if($CompareCrisp){
  if(!(Test-Path -LiteralPath $crisp) -or !(Test-Path -LiteralPath $model)){throw 'CrispASR executable or model missing'}
  $probeArgs+=@('--crisp-executable',"`"$crisp`"",'--crisp-model',"`"$model`"")
}
$p=Start-Process -FilePath (Join-Path $root '.venv-voice/Scripts/python.exe') -ArgumentList $probeArgs -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$prefix.stdout" -RedirectStandardError "$prefix.stderr" -PassThru
$null=$p.Handle;$reason='timeout';$deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
try {
  while([DateTime]::UtcNow -lt $deadline){
    $sample=Resources;($sample | ConvertTo-Json -Compress) | Add-Content -LiteralPath "$prefix.samples.jsonl" -Encoding utf8
    if($sample.availableRam -lt 6GB){$reason='RAM reserve';break}
    if($sample.dedicated -gt 22GB){$reason='dedicated GPU threshold';break}
    if($sample.shared -gt 256MB){$reason='shared GPU threshold';break}
    $p.Refresh();if($p.HasExited){$reason=if($p.ExitCode -eq 0){'probe completed'}else{"probe failed: $($p.ExitCode)"};break}
  }
} finally {
  $p.Refresh()
  if(!$p.HasExited){
    # Stop only the exact candidate executable descended from this owned probe.
    $processes=@(Get-CimInstance Win32_Process)
    $byId=@{};foreach($item in $processes){$byId[[int]$item.ProcessId]=$item}
    foreach($item in $processes | Where-Object {$_.ExecutablePath -eq $crisp}){
      $parent=[int]$item.ParentProcessId;$seen=@{}
      while($parent -gt 0 -and !$seen.ContainsKey($parent) -and $byId.ContainsKey($parent)){
        if($parent -eq $p.Id){Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue;break}
        $seen[$parent]=$true;$parent=[int]$byId[$parent].ParentProcessId
      }
    }
    Stop-Process -Id $p.Id -Force;$p.WaitForExit()
  }
}
@{reason=$reason;baseline=$base;stdout="$prefix.stdout";stderr="$prefix.stderr";samples="$prefix.samples.jsonl"} | ConvertTo-Json -Compress
if($reason -ne 'probe completed'){exit 1}
