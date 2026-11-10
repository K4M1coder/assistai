# Generate a synthetic English tool request locally; no microphone is used.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$root = Split-Path -Parent $PSScriptRoot
$speaker = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $speaker.SelectVoice('Microsoft Zira Desktop')
    $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $speaker.SetOutputToWaveFile((Join-Path $root '.cache/lfm3-tool-synthetic.wav'), $format)
    $speaker.Speak('Please set the volume to thirty percent.')
} finally { $speaker.Dispose() }
