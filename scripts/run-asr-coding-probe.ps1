param([int]$TimeoutSeconds=180, [switch]$CompareCrisp, [switch]$FixtureOnly, [switch]$VoiceCases, [switch]$EditCase, [switch]$Kyutai, [switch]$ComparePadding, [switch]$VoiceLoopback, [switch]$KyutaiInput, [switch]$PairedInput, [switch]$PersistentTrial, [switch]$NativeOutput, [switch]$NativeConcurrentOutput, [switch]$NotificationTts, [switch]$NotificationTtsControl, [switch]$NotificationTtsSpelling, [ValidateSet('audio-f16','interleaved-f16','audio-q8','interleaved-q8','interleaved-q8-reasoning-off','interleaved-q8-reasoning-off-repeat2','agent-notification','browser-agent-notification','browser-capture-roundtrip','pocket-agent-notification','math-windows','browser-barge-math')][string]$NativeSample, [ValidatePattern('^[A-Za-z0-9_-]{1,40}$')][string]$NativeBrowserRunId, [switch]$ProcessMetrics, [switch]$LocalCrispBuild, [switch]$FixedSyntheticFixture, [switch]$NaturalFixture, [ValidateSet(1,8,64)][int]$NaturalGain=1, [ValidateSet('male','female')][string]$NaturalVoice='male', [ValidateSet(2,4)][int]$ASRThreads=2, [ValidateSet('math','capital')][string]$VoiceScenario='math')
$ErrorActionPreference='Stop'
if($Kyutai -and !$CompareCrisp){throw 'Kyutai requires -CompareCrisp'}
if($ComparePadding -and !$CompareCrisp){throw 'Padding comparison requires -CompareCrisp'}
if($EditCase -and ($FixtureOnly -or $VoiceCases -or $VoiceLoopback -or $PersistentTrial -or $NativeOutput -or $NotificationTts)){throw 'EditCase is a separate case set'}
if($FixtureOnly -and $VoiceCases){throw 'Choose one case set'}
if($VoiceLoopback -and ($CompareCrisp -or $FixtureOnly -or $VoiceCases -or $Kyutai -or $ComparePadding)){throw 'VoiceLoopback is a separate probe'}
if($PairedInput -and !$VoiceLoopback){throw 'PairedInput requires VoiceLoopback'}
if($KyutaiInput -and !$VoiceLoopback){throw 'KyutaiInput requires -VoiceLoopback'}
if($PersistentTrial -and ($VoiceLoopback -or $CompareCrisp -or $FixtureOnly -or $VoiceCases -or $Kyutai -or $ComparePadding -or $KyutaiInput)){throw 'PersistentTrial is a separate probe'}
if($ProcessMetrics -and !$PersistentTrial){throw 'ProcessMetrics requires -PersistentTrial'}
if($LocalCrispBuild -and !$PersistentTrial){throw 'LocalCrispBuild requires -PersistentTrial'}
if($FixedSyntheticFixture -and !$PersistentTrial){throw 'FixedSyntheticFixture requires -PersistentTrial'}
if($NaturalFixture -and (!$PersistentTrial -or $FixedSyntheticFixture)){throw 'NaturalFixture requires PersistentTrial and excludes FixedSyntheticFixture'}
if($NaturalGain -ne 1 -and !$NaturalFixture){throw 'NaturalGain requires NaturalFixture'}
if($ASRThreads -ne 2 -and !$PersistentTrial){throw 'ASRThreads requires PersistentTrial'}
if($NativeOutput -and ($PersistentTrial -or $VoiceLoopback -or $CompareCrisp -or $FixtureOnly -or $VoiceCases -or $Kyutai -or $ComparePadding -or $KyutaiInput)){throw 'NativeOutput is a separate probe'}
if($NativeConcurrentOutput -and !$NativeOutput){throw 'NativeConcurrentOutput requires NativeOutput'}
if($NativeSample -and (!$NativeOutput -or $NativeConcurrentOutput)){throw 'NativeSample requires NativeOutput and excludes NativeConcurrentOutput'}
if($NativeBrowserRunId -and (!$NativeOutput -or $NativeSample -notin @('browser-agent-notification','browser-barge-math'))){throw 'NativeBrowserRunId requires a supported browser sample'}
if($NotificationTts -and ($NativeOutput -or $PersistentTrial -or $VoiceLoopback -or $CompareCrisp -or $FixtureOnly -or $VoiceCases -or $Kyutai -or $ComparePadding -or $KyutaiInput)){throw 'NotificationTts is a separate probe'}
if($NotificationTtsControl -and !$NotificationTts){throw 'NotificationTtsControl requires NotificationTts'}
if($NotificationTtsSpelling -and (!$NotificationTts -or $NotificationTtsControl)){throw 'NotificationTtsSpelling requires NotificationTts and excludes NotificationTtsControl'}
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
if($VoiceLoopback){$probeArgs=@((Join-Path $root 'scripts/probe-voice-loopback.py'),'--scenario',$VoiceScenario);if($KyutaiInput){$probeArgs+=@('--input-asr','kyutai')};if($PairedInput){$probeArgs+='--paired-input'}}
if($PersistentTrial){$probeArgs=@((Join-Path $root 'scripts/probe-kyutai-persistent.py'),'--scenario',$VoiceScenario,'--threads',[string]$ASRThreads)}
if($NativeOutput){$probeArgs=@((Join-Path $root 'scripts/probe-native-output.py'))}
if($NotificationTts){$probeArgs=@((Join-Path $root 'scripts/probe-notification-tts.py'))}
if($NotificationTtsControl){$probeArgs+='--language-control'}
if($NotificationTtsSpelling){$probeArgs+='--spelling-control'}
if($NativeConcurrentOutput){$probeArgs+='--concurrent'}
if($NativeSample){$probeArgs+=@('--sample',$NativeSample)}
if($NativeBrowserRunId){$probeArgs+=@('--browser-run-id',$NativeBrowserRunId)}
if($FixedSyntheticFixture){$probeArgs+='--fixed-synthetic-fixture'}
if($NaturalFixture){$probeArgs+=@('--natural-fixture','--natural-gain',[string]$NaturalGain,'--natural-voice',$NaturalVoice)}
if($FixtureOnly){$probeArgs+='--fixture-only'}
if($VoiceCases){$probeArgs+='--voice-only'}
if($EditCase){$probeArgs+='--edit-only'}
if($ComparePadding){$probeArgs+='--compare-padding'}
$crisp=Join-Path $root '.cache/crispasr-v0.8.53-windows-cpu/crispasr-windows-x86_64-cpu/crispasr.exe'
if($LocalCrispBuild){
  $crisp=Join-Path $root '.cache/crispasr-source/build-local/bin/crispasr.exe'
  if(!(Test-Path -LiteralPath $crisp -PathType Leaf)){throw 'Local CrispASR build is missing'}
  $probeArgs+=@('--executable',"`"$crisp`"")
}
$model=Join-Path $env:USERPROFILE '.lmstudio/models/cstr/stt-fr-fastconformer-hybrid-ctc-large-GGUF/stt-fr-fastconformer-hybrid-ctc-large-q8_0.gguf'
if($Kyutai){$model=Join-Path $root '.cache/kyutai-crisp-research/kyutai-stt-1b-q4_k.gguf';$probeArgs+=@('--crisp-backend','kyutai-stt')}
if($CompareCrisp){
  if(!(Test-Path -LiteralPath $crisp) -or !(Test-Path -LiteralPath $model)){throw 'CrispASR executable or model missing'}
  $probeArgs+=@('--crisp-executable',"`"$crisp`"",'--crisp-model',"`"$model`"")
}
$p=Start-Process -FilePath (Join-Path $root '.venv-voice/Scripts/python.exe') -ArgumentList $probeArgs -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$prefix.stdout" -RedirectStandardError "$prefix.stderr" -PassThru
$null=$p.Handle;$reason='timeout';$deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
try {
  while([DateTime]::UtcNow -lt $deadline){
    $sample=Resources
    if($sample.availableRam -lt 6GB -or $sample.dedicated -gt 22GB -or $sample.shared -gt 256MB){
      ($sample | ConvertTo-Json -Compress) | Add-Content -LiteralPath "$prefix.samples.jsonl" -Encoding utf8
      $reason=if($sample.availableRam -lt 6GB){'RAM reserve'}elseif($sample.dedicated -gt 22GB){'dedicated GPU threshold'}else{'shared GPU threshold'}
      break
    }
    if($ProcessMetrics){
      $all=@(Get-CimInstance Win32_Process);$byId=@{};foreach($item in $all){$byId[[int]$item.ProcessId]=$item}
      $working=[long]0;$private=[long]0;$count=0
      foreach($item in $all | Where-Object {$_.ExecutablePath -eq $crisp}){
        $parent=[int]$item.ParentProcessId;$seen=@{}
        while($parent -gt 0 -and !$seen.ContainsKey($parent) -and $byId.ContainsKey($parent)){
          if($parent -eq $p.Id){$tracked=Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue;if($tracked){$working+=$tracked.WorkingSet64;$private+=$tracked.PrivateMemorySize64;$count++};break}
          $seen[$parent]=$true;$parent=[int]$byId[$parent].ParentProcessId
        }
      }
      $sample.candidateCount=$count;$sample.candidateWorkingSet=$working;$sample.candidatePrivateBytes=$private
    }
    ($sample | ConvertTo-Json -Compress) | Add-Content -LiteralPath "$prefix.samples.jsonl" -Encoding utf8
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
    foreach($item in $processes | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*prototype*gateway.mjs*' }){
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
