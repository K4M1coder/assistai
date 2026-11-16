"""Test a synthetic French audio stream on the local CPU ASR; no microphone."""
import importlib.util
import json
import subprocess
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / '.cache/crispasr-v0.8.53-windows-cpu/crispasr-windows-x86_64-cpu/crispasr.exe'
MODEL = Path.home() / '.lmstudio/models/cstr/stt-fr-fastconformer-hybrid-ctc-large-GGUF/stt-fr-fastconformer-hybrid-ctc-large-q8_0.gguf'


def main():
    if not EXE.is_file() or not MODEL.is_file():
        raise RuntimeError('Local executable or model is missing')
    spec = importlib.util.spec_from_file_location('spoken_recall', ROOT / 'scripts/probe-spoken-session-recall.py')
    spoken = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(spoken)
    pcm = spoken.synthesize('Quel est le mot écrit dans le fichier fixture point texte ?')
    started = time.monotonic()
    process = subprocess.Popen([str(EXE), '--backend', 'fastconformer-ctc', '-m', str(MODEL), '--stream',
        '-ng', '-t', '2', '-nt', '-np', '-l', 'fr', '--lid-backend', 'off', '--no-punctuation'],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    watchdog = threading.Timer(45, process.kill)
    watchdog.daemon = True
    watchdog.start()
    output, errors, timestamps = bytearray(), bytearray(), []
    def read_output():
        while chunk := process.stdout.read(1):
            output.extend(chunk)
            timestamps.append(time.monotonic())
    def read_errors():
        while chunk := process.stderr.read(1024):
            errors.extend(chunk)
    readers = [threading.Thread(target=read_output, daemon=True), threading.Thread(target=read_errors, daemon=True)]
    for reader in readers: reader.start()
    try:
        for offset in range(0, len(pcm), 3200):
            process.stdin.write(pcm[offset:offset + 3200]); process.stdin.flush()
            time.sleep(0.1)
        closed_at = time.monotonic()
        process.stdin.close()
        process.wait(timeout=45)
        for reader in readers: reader.join(timeout=2)
    finally:
        watchdog.cancel()
        if process.poll() is None:
            process.kill(); process.wait(timeout=5)
    print(json.dumps({'returncode':process.returncode, 'stdout':bytes(output).decode('utf-8', 'replace')[-2000:],
        'stderr':bytes(errors).decode('utf-8', 'replace')[-2000:], 'elapsed_ms':round((time.monotonic()-started)*1000),
        'first_stdout_ms':round((timestamps[0]-started)*1000) if timestamps else None,
        'stdout_before_eof':any(value < closed_at for value in timestamps),
        'synthetic_audio_bytes':len(pcm), 'physical_devices_opened':False, 'audio_file_written_by_probe':False}, ensure_ascii=False))


if __name__ == '__main__':
    main()
