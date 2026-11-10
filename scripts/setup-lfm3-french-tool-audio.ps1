# Synthetic French tool request; no microphone or tool execution.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$root = Split-Path -Parent $PSScriptRoot
$voice = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $voice.SelectVoice('Microsoft Hortense Desktop')
  $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $voice.SetOutputToWaveFile((Join-Path $root '.cache/lfm3-tool-french.wav'), $format)
  $voice.Speak("D$([char]0x00E9)l$([char]0x00E8)gue $([char]0x00E0) l'agent la t$([char]0x00E2)che de v$([char]0x00E9)rifier la m$([char]0x00E9)t$([char]0x00E9)o $([char]0x00E0) Paris.")
} finally { $voice.Dispose() }
