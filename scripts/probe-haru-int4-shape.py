"""Check one small real-checkpoint linear shape with synthetic XPU weights.

No checkpoint, speech or model is loaded. Only the smallest eligible shape is
allowed until a whole-system watchdog exists for larger shapes.
"""
import json
import torch
from torchao.quantization import Int4WeightOnlyConfig, quantize_


def main():
    if not torch.xpu.is_available():
        raise RuntimeError('Intel XPU is unavailable')
    torch.manual_seed(21)
    torch.xpu.init()
    torch.xpu.reset_peak_memory_stats()
    layer = torch.nn.Linear(2560, 32, bias=False, device='xpu:0', dtype=torch.bfloat16).eval()
    activation = torch.randn(1, 2560, device='xpu:0', dtype=torch.bfloat16)
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
        result = {'shape':[32,2560], 'quantized_weight_type':type(layer.weight).__name__,
                  'max_absolute_difference':float(difference.max().cpu()),
                  'mean_absolute_difference':float(difference.mean().cpu()),
                  'torch_peak_allocated_bytes':torch.xpu.max_memory_allocated(),
                  'torch_peak_reserved_bytes':torch.xpu.max_memory_reserved(),
                  'note':'One synthetic linear layer only; not quality, performance, KV-cache or system peak evidence.'}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
