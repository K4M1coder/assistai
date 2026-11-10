# Synthetic French fixture request; no microphone is used.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$root = Split-Path -Parent $PSScriptRoot
$s = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $s.SelectVoice('Microsoft Hortense Desktop')
  $fmt = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $s.SetOutputToWaveFile((Join-Path $root '.cache/lfm3-fixture-french.wav'), $fmt)
  $s.Speak("D$([char]0x00E9)l$([char]0x00E8)gue $([char]0x00E0) l'agent la lecture du fichier fixture point texte et demande le mot secret.")
} finally { $s.Dispose() }
