"""Research-only streamed INT4 loader exercised on a tiny synthetic checkpoint.

Not a production loader and not safe evidence for a full-size model load.
"""
import copy
import json
import math
import sys
import tempfile
from pathlib import Path

import torch
from safetensors import safe_open
from safetensors.torch import save_file
from torchao.quantization import Int4WeightOnlyConfig, quantize_

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.cache/haru-research/haru'))
from haru.config import HaruConfig  # noqa: E402
from haru.models.haru import HaruModel  # noqa: E402
from haru.models.vibevoice_codec import CodecStream  # noqa: E402


def load_streamed(model, filename, device='xpu:0'):
    """Assign one tensor at a time; quantize only eligible backbone linears."""
    if Path(filename).stat().st_size > 8 * 1024 * 1024:
        raise ValueError('Research probe accepts only tiny checkpoints (8 MiB maximum)')
    if any(p.device.type != 'meta' for p in model.parameters()):
        raise ValueError('Expected an empty meta-device model')
    params = dict(model.named_parameters(remove_duplicate=False))
    if len({id(p) for p in params.values()}) != len(params):
        raise ValueError('Shared parameter aliases require explicit handling')
    expected = model.state_dict()
    config = Int4WeightOnlyConfig(group_size=32, set_inductor_config=False, int4_packing_format='plain_int32')
    count, largest = 0, 0
    with safe_open(filename, framework='pt', device='cpu') as source:
        if set(source.keys()) != set(expected):
            raise ValueError('Checkpoint keys do not match model state')
        for key in source.keys():
            tensor = source.get_tensor(key)
            if tensor.shape != expected[key].shape or tensor.dtype != torch.bfloat16:
                raise ValueError(f'Unexpected tensor shape or dtype: {key}')
            largest = max(largest, tensor.numel() * tensor.element_size())
            parent_name, _, name = key.rpartition('.')
            parent = model.get_submodule(parent_name) if parent_name else model
            value = tensor.to(device)
            if name in parent._parameters:
                parent._parameters[name] = torch.nn.Parameter(value, requires_grad=False)
                if (key.startswith('lm.') and name == 'weight' and isinstance(parent, torch.nn.Linear)
                        and parent.in_features % 32 == 0):
                    quantize_(parent, config, filter_fn=lambda module, _: module is parent)
                    if type(parent.weight).__name__ != 'Int4PlainInt32Tensor':
                        raise RuntimeError(f'Weight was not quantized: {key}')
                    count += 1
            elif name in parent._buffers:
                parent._buffers[name] = value
            else:
                raise ValueError(f'Unknown model state: {key}')
    # Non-persistent rotary buffers are not in the checkpoint; rebuild from config.
    rotary = model.lm.rotary_emb
    model.lm.rotary_emb = type(rotary)(model.lm.config).to(device)
    for name in ('t_embed', 'dt_embed', 'h_embed', 'omega_embed'):
        embed = getattr(model.head, name)
        half = embed.freqs.numel()
        embed._buffers['freqs'] = torch.exp(-math.log(10000.0) * torch.arange(half, dtype=torch.float32, device=device) / half)
    remaining = [name for name, tensor in list(model.named_parameters()) + list(model.named_buffers()) if tensor.device.type == 'meta']
    if remaining:
        raise RuntimeError(f'Model retains uninitialized meta tensors: {remaining}')
    return {'quantized_layers': count, 'largest_bf16_tensor_bytes': largest}


def main():
    if not torch.xpu.is_available():
        raise RuntimeError('Intel XPU is unavailable')
    torch.manual_seed(7)
    config = HaruConfig.from_dict({
        'frame_samples':4, 'latent_dim':8, 'pad_token_id':0, 'eop_token_id':1,
        'lm':{'vocab_size':128, 'hidden_size':32, 'intermediate_size':64, 'num_hidden_layers':2,
              'num_attention_heads':4, 'num_key_value_heads':2, 'head_dim':8,
              'linear_key_head_dim':8, 'linear_value_head_dim':8, 'linear_num_key_heads':4,
              'linear_num_value_heads':4, 'layer_types':['linear_attention','full_attention'], 'max_position_embeddings':64},
        'codec':{'latent_dim':8, 'base_channels':4, 'ratios':[2,2], 'encoder_depths':[1,1,1], 'decoder_depths':[1,1,1]},
        'head':{'hidden_size':32, 'latent_dim':8, 'num_layers':2},
    })
    model = HaruModel(config).eval()
    with torch.no_grad():
        for parameter in model.parameters(): torch.nn.init.normal_(parameter, mean=0.0, std=0.05)
    model = model.to(dtype=torch.bfloat16)
    model.lm.rotary_emb = type(model.lm.rotary_emb)(model.lm.config)
    for name in ('t_embed', 'dt_embed', 'h_embed', 'omega_embed'):
        embed = getattr(model.head, name)
        half = embed.freqs.numel()
        embed._buffers['freqs'] = torch.exp(-math.log(10000.0) * torch.arange(half, dtype=torch.float32) / half)
    # The actual published checkpoint stores all persistent tensors as BF16.
    state = {key:value.detach().to(torch.bfloat16).contiguous() for key,value in model.state_dict().items()}
    with tempfile.NamedTemporaryFile(suffix='.safetensors', delete=False) as temporary:
        filename = Path(temporary.name)
    try:
        save_file(state, str(filename))
        with torch.device('meta'):
            empty = HaruModel(config).eval()
        torch.xpu.init(); torch.xpu.reset_peak_memory_stats()
        info = load_streamed(empty, filename)
        torch.xpu.synchronize()
        peak = torch.xpu.max_memory_allocated()
        reference = copy.deepcopy(model).to('xpu:0')
        select = lambda module, _: isinstance(module, torch.nn.Linear) and module.in_features % 32 == 0
        quantize_(reference.lm, Int4WeightOnlyConfig(group_size=32, set_inductor_config=False, int4_packing_format='plain_int32'), filter_fn=select)
        @torch.inference_mode()
        def run(instance):
            cache = instance.new_cache()
            hidden = instance(instance.embed(torch.tensor([[2,3,4]], device='xpu:0')), cache)
            step = instance(instance.embed(torch.tensor([[5]], device='xpu:0')), cache)
            codec = CodecStream(instance.codec)
            latent = codec.encode(torch.zeros(1, 4))
            speech = codec.decode(latent)
            head = instance.head.sample(step[:, -1], torch.zeros((1, 8), device='xpu:0', dtype=torch.bfloat16))
            return hidden, step, latent, speech, head
        differences = {}
        for name, left, right in zip(('prefill','cached_step','encode','decode','head'), run(empty), run(reference), strict=True):
            left, right = left.float().cpu(), right.float().cpu()
            torch.testing.assert_close(left, right, atol=0.01, rtol=0.01)
            differences[name] = float((left-right).abs().max())
        with filename.open('r+b') as file:
            file.truncate(8 * 1024 * 1024 + 1)
        try:
            load_streamed(empty, filename)
        except ValueError as error:
            if '8 MiB maximum' not in str(error): raise
        else:
            raise AssertionError('Oversized checkpoint was not rejected')
        print(json.dumps({**info, 'max_absolute_difference':differences,
                          'torch_load_peak_allocated_bytes':peak,
                          'note':'Tiny synthetic checkpoint; not full-model safety, peak system memory, quality, or latency evidence.'}))
    finally:
        filename.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
