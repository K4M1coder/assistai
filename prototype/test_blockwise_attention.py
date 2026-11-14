import importlib.util
from pathlib import Path
import unittest

import torch
import torch.nn.functional as functional

spec = importlib.util.spec_from_file_location('blockwise_probe', Path('scripts/probe-blockwise-int8-attention.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class BlockwiseAttentionTests(unittest.TestCase):
    def test_matches_dequantized_attention_across_partial_blocks_and_gqa(self):
        torch.manual_seed(13)
        for length, block, factor in [(1, 4, 1), (19, 7, 1), (37, 8, 8)]:
            query = torch.randn(1, 4, 1, 16) * factor
            key, value = (torch.randn(1, 2, length, 16) for _ in range(2))
            qkey, ks = probe.quantize(key); qvalue, vs = probe.quantize(value)
            actual = probe.blockwise(query, qkey, qvalue, ks, vs, block=block)
            expected = functional.scaled_dot_product_attention(query, qkey.float() * ks, qvalue.float() * vs, enable_gqa=True)
            torch.testing.assert_close(actual, expected, atol=0.0002, rtol=0.0002)

    def test_rejects_invalid_query_and_grouping(self):
        with self.assertRaises(ValueError):
            probe.blockwise(torch.zeros(1, 3, 1, 16), torch.zeros(1, 2, 2, 16), torch.zeros(1, 2, 2, 16), 1, 1)


if __name__ == '__main__':
    unittest.main()
