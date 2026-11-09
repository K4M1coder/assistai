# Generate synthetic French speakers locally; no microphone is used.
Add-Type -AssemblyName System.Speech
$outputDirectory = Join-Path $PSScriptRoot '..\.cache'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$voice = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $examples = @(
        @{ voice = 'Microsoft Hortense Desktop'; file = 'tse-target.wav'; text = 'Bonjour, je voudrais préparer un voyage en train pour visiter plusieurs villes françaises pendant les vacances.' },
        @{ voice = 'Microsoft Paul'; file = 'tse-interferer.wav'; text = 'La télévision diffuse une émission et les invités discutent de musique et de leur journée dans le salon.' },
        @{ voice = 'Microsoft Hortense Desktop'; file = 'tse-enroll.wav'; text = 'Voici un exemple de ma voix pour que mon assistant personnel puisse me reconnaître correctement dans une pièce.' }
    )
    foreach ($example in $examples) {
        $voice.SetOutputToNull()
        $voice.SelectVoice($example.voice)
        $voice.SetOutputToWaveFile((Join-Path $outputDirectory $example.file))
        $voice.Speak($example.text)
    }
} finally { $voice.Dispose() }
