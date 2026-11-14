"""CPU-only experiment with a tiny Haru hybrid INT8 cache; not production code."""
import json
import sys
from pathlib import Path

import torch
from transformers.cache_utils import Cache, DynamicCache, LinearAttentionLayer, QuantizedCache, QuantizedLayer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.cache/haru-research/haru'))
from haru.config import HaruConfig  # noqa: E402
from haru.models.haru import HaruModel  # noqa: E402


class ExperimentalInt8Layer(QuantizedLayer):
    """Per-tensor symmetric quantization; dequantizes full history every step."""
    def _quantize(self, tensor, axis):
        scale = tensor.float().abs().max() / 127
        scale = torch.where(scale == 0, torch.ones_like(scale), scale)
        return (tensor.float().div(scale).round().clamp(-127, 127).to(torch.int8), scale, tensor.dtype)

    def _dequantize(self, encoded):
        values, scale, dtype = encoded
        return (values.float() * scale).to(dtype)


@torch.inference_mode()
def main():
    torch.set_num_threads(1); torch.manual_seed(9)
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
    for parameter in model.parameters(): torch.nn.init.normal_(parameter, mean=0.0, std=0.05)
    model = model.to(dtype=torch.bfloat16)
    try:
        QuantizedCache('quanto', model.lm.config)
    except ValueError as error:
        if 'linear_attention' not in str(error): raise
        stock_rejected = True
    else:
        raise AssertionError('Expected stock QuantizedCache to reject hybrid attention')
    baseline = DynamicCache(config=model.lm.config)
    quantized = Cache(layers=[LinearAttentionLayer(), ExperimentalInt8Layer(nbits=8, residual_length=2)])
    errors=[]
    for token in (2,3,4,5,6,7):
        inputs=model.embed(torch.tensor([[token]]))
        reference=model(inputs, baseline)
        actual=model(inputs, quantized)
        if not torch.isfinite(actual).all(): raise RuntimeError('Non-finite output')
        errors.append(float((reference.float()-actual.float()).abs().max()))
    layer=quantized.layers[1]
    if layer._quantized_keys[0].dtype != torch.int8 or layer._quantized_values[0].dtype != torch.int8:
        raise AssertionError('Expected INT8 cache payload')
    print(json.dumps({'stock_quantized_cache_rejected_hybrid':stock_rejected, 'steps':len(errors),
                      'max_hidden_difference':max(errors), 'quantized_key_bytes':layer._quantized_keys[0].numel(),
                      'quantized_value_bytes':layer._quantized_values[0].numel(),
                      'note':'Tiny random CPU model and simple per-tensor INT8. Full dequantization each step; not production, accuracy, speed or XPU evidence.'}))


if __name__ == '__main__':
    main()
