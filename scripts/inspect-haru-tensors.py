"""Estimate eligible weight sizes from pinned remote headers and a meta-device model.

This does not download checkpoint weights, load a GPU model, or predict peak memory.
"""
import json
import sys
import urllib.request
from pathlib import Path

import torch
from huggingface_hub import get_safetensors_metadata

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.cache/haru-research/haru'))
from haru.config import HaruConfig  # noqa: E402
from haru.models.haru import HaruModel  # noqa: E402

REPOSITORY = 'higurashi-ai/Haru-4B'
REVISION = '8d6e83bcd3701a76fc27a764965665da1df7da78'


def main():
    url = f'https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/config.json'
    with urllib.request.urlopen(url, timeout=30) as response:
        config = HaruConfig.from_dict(json.load(response))
    with torch.device('meta'):
        model = HaruModel(config)
    metadata = get_safetensors_metadata(REPOSITORY, revision=REVISION, timeout=30)
    tensors = metadata.files_metadata['model.safetensors'].tensors
    targets = {}
    for name, module in model.lm.named_modules():
        if isinstance(module, torch.nn.Linear) and module.in_features % 32 == 0:
            key = f'lm.{name}.weight'
            tensor = tensors.get(key)
            if tensor is None or tuple(tensor.shape) != tuple(module.weight.shape):
                raise RuntimeError(f'Missing or mismatched checkpoint tensor: {key}')
            targets[key] = tensor
    if not targets or any(t.dtype != 'BF16' for t in tensors.values()):
        raise RuntimeError('Unexpected checkpoint contents')
    count = sum(t.parameter_count for t in targets.values())
    total = sum(t.parameter_count for t in tensors.values())
    groups = sum(t.parameter_count // 32 for t in targets.values())
    print(json.dumps({'revision': REVISION, 'tensor_count':len(tensors), 'total_bf16_parameter_bytes':total * 2,
                      'eligible_linear_tensors':len(targets), 'eligible_parameters':count,
                      'remaining_bf16_parameter_bytes':(total - count) * 2,
                      'ideal_int4_data_bytes':(count + 1) // 2,
                      'ideal_group_metadata_bytes_assuming_bf16_scale_int8_zero':groups * 3,
                      'note':'Weight payload arithmetic only; excludes padding, runtime, all cache, transient loads and allocator overhead.'}))


if __name__ == '__main__':
    main()
