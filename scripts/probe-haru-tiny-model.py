"""Run a tiny randomly initialized Haru architecture on CPU and XPU.

This checks selected operator paths, not model quality, latency or memory fit.
"""
import copy
import argparse
import json
import sys
from pathlib import Path

import torch
import transformers

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.cache/haru-research/haru'))
from haru.config import HaruConfig  # noqa: E402
from haru.models.haru import HaruModel  # noqa: E402
from haru.models.vibevoice_codec import CodecStream  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--int4', action='store_true', help='Test weight-only quantization of eligible backbone linear layers')
    args = parser.parse_args()
    if not torch.xpu.is_available():
        raise RuntimeError('Intel XPU is unavailable')
    torch.set_num_threads(1)
    torch.manual_seed(7)
    params = {
        'frame_samples': 4, 'latent_dim': 8, 'pad_token_id': 0, 'eop_token_id': 1,
        'lm': {'vocab_size': 128, 'hidden_size': 32, 'intermediate_size': 64,
               'num_hidden_layers': 2, 'num_attention_heads': 4, 'num_key_value_heads': 2,
               'head_dim': 8, 'linear_key_head_dim': 8, 'linear_value_head_dim': 8,
               'linear_num_key_heads': 4, 'linear_num_value_heads': 4,
               'layer_types': ['linear_attention', 'full_attention'], 'max_position_embeddings': 64},
        'codec': {'latent_dim': 8, 'base_channels': 4, 'ratios': [2, 2],
                  'encoder_depths': [1, 1, 1], 'decoder_depths': [1, 1, 1]},
        'head': {'hidden_size': 32, 'latent_dim': 8, 'num_layers': 2},
    }
    config = HaruConfig.from_dict(params)
    model = HaruModel(config).eval()
    with torch.no_grad():
        for parameter in model.parameters():
            torch.nn.init.normal_(parameter, mean=0.0, std=0.05)
    model = model.to(dtype=torch.bfloat16)
    gpu = copy.deepcopy(model).to('xpu:0')
    tokens = torch.tensor([[2, 3, 4]])
    audio = torch.randn(1, 8)

    @torch.inference_mode()
    def run(instance):
        cache = instance.new_cache()
        embeddings = instance.embed(tokens.to(instance.device))
        prefill = instance(embeddings, cache)
        step = instance(instance.embed(torch.tensor([[5]], device=instance.device)), cache)
        codec = CodecStream(instance.codec)
        latent1 = codec.encode(audio[:, :4])
        latent2 = codec.encode(audio[:, 4:])
        speech1 = codec.decode(latent1)
        speech2 = codec.decode(latent2)
        return [prefill, step, latent1, latent2, speech1, speech2]

    expected, observed = run(model), run(gpu)
    differences = {}
    for name, ref, result in zip(('prefill', 'cached_step', 'encode_1', 'encode_2', 'decode_1', 'decode_2'), expected, observed, strict=True):
        actual, ref = result.float().cpu(), ref.float().cpu()
        if not torch.isfinite(actual).all():
            raise RuntimeError(f'{name} produced non-finite output')
        torch.testing.assert_close(actual, ref, atol=0.05, rtol=0.1)
        differences[name] = float((actual - ref).abs().max())
    quantization = None
    if args.int4:
        from torchao.quantization import Int4WeightOnlyConfig, quantize_
        quantized = copy.deepcopy(gpu)
        eligible = lambda module, _: isinstance(module, torch.nn.Linear) and module.in_features % 32 == 0
        targets = [name for name, module in quantized.lm.named_modules() if eligible(module, name)]
        if not targets:
            raise RuntimeError('No eligible backbone linear layers')
        quantize_(quantized.lm, Int4WeightOnlyConfig(group_size=32, set_inductor_config=False, int4_packing_format='plain_int32'), filter_fn=eligible)
        tensors = [type(dict(quantized.lm.named_modules())[name].weight).__name__ for name in targets]
        if any(name != 'Int4PlainInt32Tensor' for name in tensors):
            raise RuntimeError(f'Unexpected quantized weight representation: {tensors}')
        output = run(quantized)
        quant_differences = {}
        for name, ref, result in zip(('prefill', 'cached_step', 'encode_1', 'encode_2', 'decode_1', 'decode_2'), observed, output, strict=True):
            actual, ref = result.float().cpu(), ref.float().cpu()
            if not torch.isfinite(actual).all():
                raise RuntimeError(f'Quantized {name} produced non-finite output')
            quant_differences[name] = float((actual - ref).abs().max())
        quantization = {'method':'torchao Int4WeightOnlyConfig', 'group_size':32, 'layers':len(targets),
                        'weight_types':sorted(set(tensors)), 'max_absolute_error':quant_differences}
    torch.xpu.synchronize()
    print(json.dumps({'torch':torch.__version__, 'transformers':transformers.__version__, 'device':torch.xpu.get_device_name(0),
                      'max_absolute_error':differences, 'quantization':quantization, 'peak_allocated_bytes':torch.xpu.max_memory_allocated(0),
                      'note':'Tiny random model; not a real checkpoint, speech-quality, performance or memory-fit test.'}))


if __name__ == '__main__':
    main()
