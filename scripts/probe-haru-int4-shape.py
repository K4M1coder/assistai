"""Check one real-checkpoint linear shape with synthetic XPU weights.

No checkpoint, speech or model is loaded. Larger shapes require the watchdog.
"""
import argparse
import json
import os
import torch
from torchao.quantization import Int4WeightOnlyConfig, quantize_


def main():
    shapes = {(32,2560), (1024,2560), (2560,4096), (2560,9216),
              (4096,2560), (8192,2560), (9216,2560)}
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shape', default='32x2560')
    args = parser.parse_args()
    try: shape = tuple(int(value) for value in args.shape.split('x'))
    except ValueError as error: raise ValueError('Invalid shape') from error
    if shape not in shapes: raise ValueError('Shape is not in the pinned checkpoint')
    if shape != (32,2560) and os.environ.get('ASSISTAI_SHAPE_WATCHDOG') != '1':
        raise RuntimeError('Use the guarded shape runner for larger tensors')
    if not torch.xpu.is_available():
        raise RuntimeError('Intel XPU is unavailable')
    torch.manual_seed(21)
    torch.xpu.init()
    torch.xpu.reset_peak_memory_stats()
    layer = torch.nn.Linear(shape[1], shape[0], bias=False, device='xpu:0', dtype=torch.bfloat16).eval()
    activation = torch.randn(1, shape[1], device='xpu:0', dtype=torch.bfloat16)
    with torch.inference_mode():
        expected = layer(activation).float()
        quantize_(layer, Int4WeightOnlyConfig(group_size=32, set_inductor_config=False, int4_packing_format='plain_int32'))
        if type(layer.weight).__name__ != 'Int4PlainInt32Tensor':
            raise RuntimeError('Expected XPU INT4 weights')
        actual = layer(activation).float()
        if not torch.isfinite(actual).all():
            raise RuntimeError('Non-finite INT4 result')
        difference = (expected - actual).abs()
        torch.xpu.synchronize()
        result = {'shape':shape, 'quantized_weight_type':type(layer.weight).__name__,
                  'max_absolute_difference':float(difference.max().cpu()),
                  'mean_absolute_difference':float(difference.mean().cpu()),
                  'torch_peak_allocated_bytes':torch.xpu.max_memory_allocated(),
                  'torch_peak_reserved_bytes':torch.xpu.max_memory_reserved(),
                  'note':'One synthetic linear layer only; not quality, performance, KV-cache or system peak evidence.'}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
