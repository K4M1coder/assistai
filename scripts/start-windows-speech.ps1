param([int]$TimeoutSeconds=120)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$python=Join-Path $root '.venv-voice/Scripts/python.exe'
$pocket=Join-Path $root '.venv-voice/Scripts/pocket-tts.exe'
$model=Join-Path $root '.cache/vosk/vosk-model-small-fr-0.22'
$cache=Join-Path $root '.cache/huggingface'
$record=Join-Path $root '.cache/assistant/speech-processes.json'
if($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 600){throw 'Timeout must be between 1 and 600 seconds'}
foreach($path in @($python,$pocket,$model,$cache)){if(!(Test-Path -LiteralPath $path)){throw "Required local dependency missing: $path"}}
if(Test-Path -LiteralPath $record){throw 'Speech ownership record exists; inspect it before starting'}
if(Get-NetTCPConnection -LocalPort 18081,18082 -State Listen -ErrorAction SilentlyContinue){throw 'A speech service port is already occupied; nothing was started'}
$null=New-Item -ItemType Directory -Path (Split-Path -Parent $record) -Force
$children=[System.Collections.Generic.List[System.Diagnostics.Process]]::new()
function Owned-Tree($roots) {
  $all=@(Get-CimInstance Win32_Process)
  $queue=[System.Collections.Generic.Queue[int]]::new()
  foreach($process in $roots){$queue.Enqueue($process.Id)}
  $result=[System.Collections.Generic.List[object]]::new()
  while($queue.Count){
    $id=$queue.Dequeue(); $entry=@($all | Where-Object ProcessId -eq $id)
    if($entry.Count -ne 1){continue}
    if($entry[0].CommandLine -notlike '*pocket-tts*serve*' -and $entry[0].CommandLine -notlike '*uvicorn*prototype.asr_server:app*'){throw "Unexpected speech child process: $id"}
    $process=Get-Process -Id $id -ErrorAction Stop
    $result.Add(@{id=$id;started=$process.StartTime.ToUniversalTime().ToString('o');command=$entry[0].CommandLine})
    foreach($child in @($all | Where-Object ParentProcessId -eq $id)){
      if($child.Name -ieq 'conhost.exe' -and $child.ExecutablePath -ieq (Join-Path $env:SystemRoot 'System32/conhost.exe')){continue}
      $queue.Enqueue([int]$child.ProcessId)
    }
  }
  return $result.ToArray()
}
try {
  $env:HF_HOME=$cache; $env:HF_HUB_OFFLINE='1'; $env:TRANSFORMERS_OFFLINE='1'
  $tts=Start-Process -FilePath $pocket -ArgumentList @('serve','--language','french','--host','127.0.0.1','--port','18081') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root '.cache/assistant/speech-tts.stdout') -RedirectStandardError (Join-Path $root '.cache/assistant/speech-tts.stderr') -PassThru
  $null=$tts.Handle; $children.Add($tts)
  $asr=Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','prototype.asr_server:app','--host','127.0.0.1','--port','18082') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root '.cache/assistant/speech-asr.stdout') -RedirectStandardError (Join-Path $root '.cache/assistant/speech-asr.stderr') -PassThru
  $null=$asr.Handle; $children.Add($asr)
  $deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds); $ready=$false
  do {
    foreach($child in $children){$child.Refresh();if($child.HasExited){throw 'A speech service exited during startup'}}
    try {
      $a=Invoke-RestMethod http://127.0.0.1:18082/health -TimeoutSec 2
      $t=Invoke-WebRequest http://127.0.0.1:18081/health -TimeoutSec 2
      $ready=$a.status -eq 'ready' -and $t.StatusCode -eq 200
    } catch { $ready=$false }
    if(!$ready){Start-Sleep -Milliseconds 500}
  } until($ready -or [DateTime]::UtcNow -gt $deadline)
  if(!$ready){throw 'Speech service readiness timed out'}
  $owned=@(Owned-Tree $children)
  foreach($port in @(18081,18082)){
    $listener=Get-NetTCPConnection -LocalPort $port -State Listen
    if($listener.Count -ne 1 -or $listener.OwningProcess -notin $owned.id){throw "Speech listener ownership mismatch: $port"}
  }
  @{processes=$owned} | ConvertTo-Json -Compress -Depth 4 | Set-Content -LiteralPath $record -Encoding utf8
  @{status='ready';ttsPort=18081;asrPort=18082;record=$record} | ConvertTo-Json -Compress
} catch {
  $owned=@(Owned-Tree $children); [array]::Reverse($owned)
  foreach($entry in $owned){$child=Get-Process -Id $entry.id -ErrorAction SilentlyContinue;if($child){$child.Kill();$child.WaitForExit()}}
  throw
}
