"""Diagnose onset loss with synthetic audio; no audio devices are opened."""
import asyncio
import importlib.util
import json
from pathlib import Path
import time

import numpy as np
from voxlock import VoxLock


def script(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


probe = script('voxlock_probe', 'probe-voxlock.py')
turns = script('turn_probe', 'probe-vad-asr-comparison.py')


async def main():
    question, question_hash = probe.audio('reset-question.wav')
    enrollment, enrollment_hash = probe.audio('tse-enroll.wav')
    model = VoxLock(model_dir=probe.CACHE / 'voxlock/onnx/v2', precision='int8', threads=2)
    cases = []
    for leading_ms, warmup_ms in ((0, 0), (200, 0), (500, 0), (1000, 0), (0, 200)):
        signal = np.concatenate((np.zeros(leading_ms * 16, np.float32), question, np.zeros(16000, np.float32)))
        stream = model.stream(enrollment)
        for _ in range(warmup_ms // 20):
            stream.push(np.zeros(320, np.float32))
        before = time.perf_counter()
        output = [stream.push(signal[i:i + 320]) for i in range(0, len(signal), 320)]
        output.append(stream.flush())
        filtered = np.concatenate(output)[:len(signal)]
        elapsed = time.perf_counter() - before
        captured, starts, ends = turns.detect(filtered, False)
        cases.append({'leading_ms': leading_ms, 'discarded_warmup_ms': warmup_ms, 'full_transcript': await probe.recognize(filtered),
                      'turn_transcripts': [await turns.recognize(pcm) for pcm in captured if pcm],
                      'turn_start_ms': starts, 'turn_end_ms': ends, 'stream_ms': round(elapsed * 1000)})
    print(json.dumps({'question_sha256': question_hash, 'enrollment_sha256': enrollment_hash,
                      'cases': cases, 'note': 'Offline synthetic speech; sample positions do not measure live latency.'}, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(main())
