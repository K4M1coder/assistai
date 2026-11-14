"""Measure a synthetic single-layer Haru-shaped KV cache on CPU, not a model."""
import importlib.util
import json
import time
from pathlib import Path

import torch
from transformers.cache_utils import DynamicLayer

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('haru_cache_probe', ROOT / 'scripts/probe-haru-hybrid-cache.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@torch.inference_mode()
def main():
    torch.set_num_threads(1); torch.manual_seed(29)
    shape = (1, 4, 4500, 256)  # one full-attention layer, ten minutes at 7.5 Hz
    keys, values = (torch.randn(shape, dtype=torch.bfloat16) for _ in range(2))
    updates = [(torch.randn(1, 4, 1, 256, dtype=torch.bfloat16), torch.randn(1, 4, 1, 256, dtype=torch.bfloat16)) for _ in range(16)]
    baseline = DynamicLayer()
    quantized = module.ExperimentalInt8Layer(nbits=8, residual_length=128)
    baseline.update(keys, values); quantized.update(keys, values)
    baseline_times, quantized_times = [], []
    max_error = 0.0
    for key, value in updates:
        start = time.perf_counter(); expected = baseline.update(key, value); baseline_times.append(time.perf_counter() - start)
        start = time.perf_counter(); actual = quantized.update(key, value); quantized_times.append(time.perf_counter() - start)
        for a, b in zip(actual, expected, strict=True):
            max_error = max(max_error, float((a.float() - b.float()).abs().max()))
    base_bytes = sum(t.numel() * t.element_size() for t in (baseline.keys, baseline.values))
    qbytes = sum(t.numel() * t.element_size() for t in (quantized._quantized_keys[0], quantized._quantized_values[0], quantized.keys, quantized.values))
    scale_bytes = sum(t.element_size() * t.numel() for t in (quantized._quantized_keys[1], quantized._quantized_values[1]))
    print(json.dumps({'shape':shape, 'steps':len(updates), 'bf16_payload_bytes':base_bytes,
                      'int8_payload_and_residual_bytes':qbytes, 'scale_bytes':scale_bytes,
                      'baseline_mean_ms':1000*sum(baseline_times)/len(baseline_times),
                      'quantized_mean_ms':1000*sum(quantized_times)/len(quantized_times),
                      'max_absolute_kv_error':max_error,
                      'note':'Single CPU layer, synthetic BF16 tensors, one run; excludes process peak, model attention, XPU, quality and concurrency.'}))


if __name__ == '__main__':
    main()
