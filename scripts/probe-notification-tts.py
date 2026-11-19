"""Compare local Pocket TTS and independent ASR on fixed notification text."""
import asyncio
import importlib.util
import json
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parents[1]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def main():
    spoken = load('spoken', 'probe-spoken-session-recall.py')
    asr = load('asr', 'probe-asr-coding.py')
    executable = ROOT / '.cache/crispasr-v0.8.53-windows-cpu/crispasr-windows-x86_64-cpu/crispasr.exe'
    model = ROOT / '.cache/kyutai-crisp-research/kyutai-stt-1b-q4_k.gguf'
    for text in ('Le mot secret est BLUEBIRD.', 'La tâche est terminée. Le résultat est affiché.',
                 'La tâche en arrière-plan est terminée. Extrait du résultat : Le mot secret est BLUEBIRD.'):
        started = time.monotonic()
        pcm = await asyncio.to_thread(spoken.synthesize, text)
        synthesis_ms = round((time.monotonic() - started) * 1000)
        vosk = await asr.recognize(pcm)
        kyutai, elapsed = await asyncio.to_thread(asr.recognize_crisp, pcm + bytes(32000), executable, model, 'kyutai-stt', allow_empty=True)
        print(json.dumps({'reference': text, 'vosk': vosk, 'kyutai': kyutai,
                          'vosk_wer': asr.word_error(text, vosk), 'kyutai_wer': asr.word_error(text, kyutai),
                          'audio_seconds': len(pcm) / 32000, 'synthesis_ms': synthesis_ms,
                          'kyutai_ms_including_load': elapsed, 'physical_devices_opened': False}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    asyncio.run(main())
