"""Local-only synthetic Phonon streaming probe; not a production TTS server."""
import argparse
import json
import time
from pathlib import Path

import numpy as np


PROMPTS = (
    'Bonjour, je suis votre assistant vocal local.',
    'La tâche en arrière-plan est terminée. Le fichier a été corrigé et le résultat est disponible dans la conversation.',
)


def measure_stream(model, text, *, interrupt_after_first=False, clock=time.perf_counter):
    started = clock()
    first = None
    chunks = 0
    samples = 0
    max_gap = 0.0
    previous = started
    stream = model.stream(text)
    try:
        for chunk in stream:
            now = clock()
            chunk = np.asarray(chunk)
            if chunk.ndim != 1 or not chunk.size or not np.isfinite(chunk).all():
                raise ValueError('Invalid audio chunk')
            if first is None:
                first = now - started
            elif now - previous > max_gap:
                max_gap = now - previous
            previous = now
            chunks += 1
            samples += chunk.size
            if interrupt_after_first:
                break
    finally:
        close_start = clock()
        stream.close()
        close_seconds = clock() - close_start
    elapsed = clock() - started
    if first is None:
        raise ValueError('No audio produced')
    seconds = samples / model.sample_rate
    return {'first_audio_ms': first * 1000, 'elapsed_ms': elapsed * 1000,
            'close_ms': close_seconds * 1000, 'max_inter_chunk_ms': max_gap * 1000,
            'audio_seconds': seconds, 'chunks': chunks,
            'realtime_factor': elapsed / seconds if seconds else None,
            'interrupted_after_first_chunk': interrupt_after_first}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True, help='Local checkpoint directory')
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--quant', default='q8_0')
    args = parser.parse_args()
    path = Path(args.model).expanduser().resolve(strict=True)
    if not path.is_dir() or not (path / 'config.json').is_file():
        parser.error('model must be a local directory containing config.json')
    if not 1 <= args.threads <= 32:
        parser.error('threads must be between 1 and 32')
    import ptts
    if args.quant not in ptts.available_quants():
        parser.error('quantization format is unavailable')
    ptts.set_num_threads(args.threads)
    started = time.perf_counter()
    model = ptts.TTS(str(path), device='cpu', quant=args.quant, lang='fr', voice_catalog=str(path))
    load_ms = (time.perf_counter() - started) * 1000
    if model.device != 'cpu' or 'fr' not in model.languages:
        raise RuntimeError('Expected a French-capable checkpoint on CPU')
    results = [measure_stream(model, prompt) for prompt in PROMPTS]
    interrupted = measure_stream(model, PROMPTS[1], interrupt_after_first=True)
    print(json.dumps({'runtime': ptts.__version__, 'device': model.device, 'quant': model.quant,
                      'threads': args.threads, 'sample_rate': model.sample_rate,
                      'load_ms': load_ms, 'utterances': results, 'interruption': interrupted,
                      'limitations': 'Synthetic text only; no quality, GPU usage, peak RAM, or concurrency measurement.'},
                     allow_nan=False))


if __name__ == '__main__':
    main()
