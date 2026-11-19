# Generate one synthetic French arithmetic question without opening a microphone.
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$path=Join-Path $root '.cache/lfm3-math-windows.wav'
if(Test-Path -LiteralPath $path){throw 'Synthetic fixture already exists; preserve it'}
Add-Type -AssemblyName System.Speech
$speaker=[System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $speaker.SelectVoice('Microsoft Hortense Desktop')
  $format=[System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono)
  $speaker.SetOutputToWaveFile($path,$format)
  $speaker.Speak("Combien font deux plus trois ? R$([char]0x00E9)ponds en un mot.")
} finally {$speaker.Dispose()}
Get-FileHash -LiteralPath $path -Algorithm SHA256 | Select-Object Path,Hash
