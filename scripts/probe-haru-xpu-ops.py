"""Tiny synthetic XPU operator probe; does not load model weights or audio."""
import json
import tempfile
from pathlib import Path

import torch
import torch.nn.functional as functional
from safetensors.torch import load_file, save_file


def main():
    if not torch.xpu.is_available() or not torch.xpu.is_bf16_supported():
        raise RuntimeError('An XPU with BF16 support is required')
    device = torch.device('xpu:0')
    torch.manual_seed(2026)
    torch.xpu.init()
    torch.xpu.reset_peak_memory_stats(device)
    errors = {}

    def compare(name, expected, actual):
        actual = actual.float().cpu()
        error = float((expected.float() - actual).abs().max())
        if not torch.isfinite(actual).all():
            raise RuntimeError(f'{name} produced non-finite output')
        torch.testing.assert_close(actual, expected.float(), rtol=0.03, atol=0.03, msg=lambda message: f'{name}: {message}')
        errors[name] = error

    x = torch.randn(1, 8, 64)
    weight = torch.randn(8, 8, 5)
    compare('bf16_conv1d', functional.conv1d(x.to(torch.bfloat16), weight.to(torch.bfloat16), padding=2),
            functional.conv1d(x.to(device=device, dtype=torch.bfloat16), weight.to(device=device, dtype=torch.bfloat16), padding=2))
    values = torch.randn(1, 8, 64)
    compare('bf16_rms_norm', functional.rms_norm(values.to(torch.bfloat16), (64,)),
            functional.rms_norm(values.to(device=device, dtype=torch.bfloat16), (64,)))
    query, key, value = (torch.randn(1, 2, 8, 32) for _ in range(3))
    compare('bf16_attention', functional.scaled_dot_product_attention(*(item.to(torch.bfloat16) for item in (query, key, value)), is_causal=True),
            functional.scaled_dot_product_attention(*(item.to(device=device, dtype=torch.bfloat16) for item in (query, key, value)), is_causal=True))

    with tempfile.NamedTemporaryFile(suffix='.safetensors', delete=False) as file:
        filename = Path(file.name)
    try:
        save_file({'weight': weight.to(torch.bfloat16).contiguous()}, str(filename))
        loaded = load_file(str(filename), device='xpu:0')['weight']
        if loaded.device.type != 'xpu' or not torch.equal(loaded.cpu(), weight.to(torch.bfloat16)):
            raise RuntimeError('Safetensors XPU load mismatch')
    finally:
        filename.unlink(missing_ok=True)

    torch.xpu.synchronize(device)
    print(json.dumps({'torch': torch.__version__, 'device': torch.xpu.get_device_name(device), 'max_absolute_error': errors,
                      'safetensors_direct_xpu': True, 'torch_peak_allocated_bytes': torch.xpu.max_memory_allocated(device),
                      'torch_peak_reserved_bytes': torch.xpu.max_memory_reserved(device),
                      'note': 'Tiny synthetic operators only; not Haru, performance, process-wide peak, or no-spill evidence.'}))


if __name__ == '__main__':
    main()
