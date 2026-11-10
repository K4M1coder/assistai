# Generate test inputs locally, without recording a microphone.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$root = Split-Path -Parent $PSScriptRoot
$speaker = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    foreach ($item in @(
        @{ language='english'; voice='Microsoft Zira Desktop'; text='Hello assistant. Please tell me a short fun fact about the moon.' },
        @{ language='french'; voice='Microsoft Hortense Desktop'; text='Bonjour assistant. Peux-tu me raconter une petite anecdote sur la lune ?' }
    )) {
        $dir = Join-Path $root ".cache/omni-$($item.language)"
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        $speaker.SetOutputToNull()
        $speaker.SelectVoice($item.voice)
        $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
        $speaker.SetOutputToWaveFile((Join-Path $dir 'utterance.wav'), $format)
        $speaker.Speak($item.text)
    }
} finally { $speaker.Dispose() }
python (Join-Path $PSScriptRoot 'split-omni-audio.py')
if ($LASTEXITCODE -ne 0) { throw 'Audio preparation failed.' }
