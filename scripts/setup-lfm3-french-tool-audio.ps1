# Synthetic French tool request; no microphone or tool execution.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$root = Split-Path -Parent $PSScriptRoot
$voice = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $voice.SelectVoice('Microsoft Hortense Desktop')
  $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $voice.SetOutputToWaveFile((Join-Path $root '.cache/lfm3-tool-french.wav'), $format)
  $voice.Speak("Délègue à l'agent la tâche de vérifier la météo à Paris.")
} finally { $voice.Dispose() }
