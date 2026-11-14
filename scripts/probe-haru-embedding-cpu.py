"""Test tied embedding operations on tiny synthetic CPU weights; no GPU or model."""
import copy
import json

import torch
from torchao.quantization import IntxWeightOnlyConfig, quantize_
from torchao.quantization.granularity import PerGroup


@torch.inference_mode()
def main():
    torch.manual_seed(31)
    original = torch.nn.Embedding(128, 64, dtype=torch.bfloat16).eval()
    candidate = copy.deepcopy(original)
    quantize_(candidate, IntxWeightOnlyConfig(weight_dtype=torch.int4, granularity=PerGroup(32)),
              filter_fn=lambda module, _: isinstance(module, torch.nn.Embedding))
    ids = torch.tensor([[1, 4, 9]])
    selected = torch.tensor([1, 4])
    hidden = torch.randn(1, 64, dtype=torch.bfloat16)
    operations = {
        'embedding': lambda model: model(ids),
        'all_logits': lambda model: (hidden @ model.weight.T).float(),
        'selected_logits': lambda model: hidden.float() @ model.weight[selected].float().T,
    }
    results = {}
    for name, operation in operations.items():
        try:
            expected, actual = operation(original), operation(candidate)
            results[name] = {'completed': True, 'max_absolute_difference':float((actual.float() - expected.float()).abs().max())}
        except Exception as error:
            results[name] = {'completed':False, 'error_type':type(error).__name__, 'error':str(error)[:300]}
    print(json.dumps({'quantized_weight_type':type(candidate.weight).__name__, 'operations':results,
                      'note':'Synthetic CPU test only. Default INTx packing is unpacked to int8; no speed, XPU or peak-memory claim.'}))


if __name__ == '__main__':
    main()
