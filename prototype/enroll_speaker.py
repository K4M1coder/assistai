"""Record a user-requested local WAV for experimental speaker extraction."""
import argparse
from pathlib import Path
import sys
import wave


def record(path, seconds, sounddevice):
    if not isinstance(seconds, int) or not 3 <= seconds <= 30:
        raise ValueError('Recording duration must be 3 to 30 seconds')
    path = Path(path)
    if path.exists():
        raise FileExistsError(f'Enrollment file already exists: {path}')
    if sys.platform != 'win32':
        raise RuntimeError('Enrollment recording currently supports Windows WASAPI only')
    host = next((item for item in sounddevice.query_hostapis() if item['name'] == 'Windows WASAPI'), None)
    if host is None or host['default_input_device'] < 0:
        raise RuntimeError('A default WASAPI input device is required')
    print(f'Recording {seconds} seconds from the default microphone. Speak naturally now.', flush=True)
    frames = []
    with sounddevice.RawInputStream(samplerate=16000, channels=1, dtype='int16', blocksize=320,
                                    device=host['default_input_device'],
                                    extra_settings=sounddevice.WasapiSettings(auto_convert=True)) as stream:
        for _ in range(seconds * 50):
            data, overflow = stream.read(320)
            if overflow or len(data) != 640:
                raise RuntimeError('Microphone capture failed or overflowed; no file was written')
            frames.append(bytes(data))
    # Exclusive creation prevents overwriting a file created while recording.
    with path.open('xb') as destination:
        with wave.open(destination, 'wb') as wav:
            wav.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
            wav.writeframes(b''.join(frames))
    print(f'Enrollment saved locally to {path}.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', help='New WAV file to create; existing files are never overwritten')
    parser.add_argument('--seconds', type=int, default=8, help='Recording length, 3–30 seconds (default: 8)')
    args = parser.parse_args()
    import sounddevice
    record(args.output, args.seconds, sounddevice)


if __name__ == '__main__':
    main()
