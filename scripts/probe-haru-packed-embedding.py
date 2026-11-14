"""Compare tiny Haru with packed tied embedding on CPU; no model weights."""
import copy
import json
import sys
from pathlib import Path
from types import MethodType

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / '.cache/haru-research/haru')]
from haru.config import HaruConfig  # noqa: E402
from haru.models.haru import HaruModel  # noqa: E402
from prototype.research_packed_embedding import PackedEmbedding  # noqa: E402


class Lookup(torch.nn.Module):
    def __init__(self, packed):
        super().__init__()
        self.packed = packed

    def forward(self, tokens):
        return self.packed.lookup(tokens).to(torch.bfloat16)


@torch.inference_mode()
def main():
    torch.set_num_threads(1)
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
    original = HaruModel(config).eval()
    for parameter in original.parameters(): torch.nn.init.normal_(parameter, mean=0.0, std=0.05)
    original = original.to(dtype=torch.bfloat16)
    candidate = copy.deepcopy(original)
    packed = PackedEmbedding.from_weight(candidate.lm.embed_tokens.weight)
    candidate.lm.embed_tokens = Lookup(packed)
    candidate.logits = MethodType(lambda _, hidden: packed.logits(hidden, chunk_rows=17), candidate)
    candidate.logits_fp32 = MethodType(lambda _, hidden, ids: packed.selected_logits(hidden, ids), candidate)
    tokens, selected = torch.tensor([[2,3,4]]), torch.tensor([0,1])

    def forward(model):
        cache=model.new_cache()
        model(model.embed(tokens),cache)
        hidden=model(model.embed(torch.tensor([[5]])),cache)[:,-1]
        return hidden, model.logits(hidden), model.logits_fp32(hidden,selected)

    first, second = forward(original), forward(candidate)
    names=('hidden','all_logits','selected_logits')
    differences={name:float((a.float()-b.float()).abs().max()) for name,a,b in zip(names,first,second,strict=True)}
    if not all(torch.isfinite(value).all() for value in second): raise RuntimeError('Non-finite result')
    torch.testing.assert_close(second[1][:,selected], second[2])
    print(json.dumps({'max_absolute_difference':differences,
                      'top_token_matches':int(first[1].argmax()) == int(second[1].argmax()),
                      'packed_data_bytes':packed.packed.numel(), 'scale_bytes':packed.scales.numel()*2,
                      'original_weight_bytes':original.lm.embed_tokens.weight.numel()*2,
                      'note':'Tiny random CPU model; no real checkpoint, audio, quality, speed or GPU evidence.'}))


if __name__ == '__main__':
    main()
