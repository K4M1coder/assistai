"""CPU-only synthetic blockwise INT8 attention probe; not a production kernel."""
import json
import math
import time

import torch
import torch.nn.functional as functional


def quantize(values):
    scale = values.float().abs().max() / 127
    scale = torch.where(scale == 0, torch.ones_like(scale), scale)
    return values.float().div(scale).round().clamp(-127, 127).to(torch.int8), scale


def blockwise(query, keys, values, key_scale, value_scale, block=128):
    if (query.ndim != 4 or keys.ndim != 4 or keys.shape != values.shape
            or keys.shape[-2] == 0 or keys.shape[1] == 0
            or query.shape[0] != keys.shape[0] or query.shape[-1] != keys.shape[-1]
            or query.shape[-2] != 1 or query.shape[1] % keys.shape[1] or block <= 0):
        raise ValueError('Expected one query and an integer GQA head ratio')
    repeat = query.shape[1] // keys.shape[1]
    running_max = torch.full((*query.shape[:-1], 1), -torch.inf, dtype=torch.float32)
    denominator = torch.zeros_like(running_max)
    numerator = torch.zeros_like(query, dtype=torch.float32)
    for start in range(0, keys.shape[-2], block):
        k = (keys[..., start:start + block, :].float() * key_scale).repeat_interleave(repeat, dim=1)
        v = (values[..., start:start + block, :].float() * value_scale).repeat_interleave(repeat, dim=1)
        scores = query.float() @ k.transpose(-1, -2) / math.sqrt(query.shape[-1])
        next_max = torch.maximum(running_max, scores.amax(dim=-1, keepdim=True))
        old = torch.exp(running_max - next_max)
        probabilities = torch.exp(scores - next_max)
        numerator = numerator * old + probabilities @ v
        denominator = denominator * old + probabilities.sum(dim=-1, keepdim=True)
        running_max = next_max
    return numerator / denominator


@torch.inference_mode()
def main():
    torch.set_num_threads(1); torch.manual_seed(41)
    # Haru's full-attention head dimensions, with one query at ten minutes.
    query = torch.randn(1, 16, 1, 256, dtype=torch.bfloat16)
    keys = torch.randn(1, 4, 4500, 256, dtype=torch.bfloat16)
    values = torch.randn(1, 4, 4500, 256, dtype=torch.bfloat16)
    qkeys, ks = quantize(keys); qvalues, vs = quantize(values)
    start=time.perf_counter()
    blocked = blockwise(query, qkeys, qvalues, ks, vs)
    elapsed_ms=(time.perf_counter()-start)*1000
    reference = functional.scaled_dot_product_attention(query.float(), qkeys.float()*ks, qvalues.float()*vs, enable_gqa=True)
    original = functional.scaled_dot_product_attention(query.float(), keys.float(), values.float(), enable_gqa=True)
    torch.testing.assert_close(blocked, reference, atol=0.0002, rtol=0.0002)
    print(json.dumps({'key_shape':list(keys.shape),'query_heads':query.shape[1], 'block':128,
                      'block_vs_dequantized_max_error':float((blocked-reference).abs().max()),
                      'int8_vs_bf16_max_error':float((blocked-original).abs().max()), 'blockwise_ms':elapsed_ms,
                      'note':'One CPU-only synthetic layer/run, no cache update or full model; time is not real-time or XPU evidence.'}))


if __name__ == '__main__':
    main()
