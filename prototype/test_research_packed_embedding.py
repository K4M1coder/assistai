import unittest

import torch

from prototype.research_packed_embedding import PackedEmbedding


class PackedEmbeddingTests(unittest.TestCase):
    def test_tied_operations_are_consistent_and_approximate_bf16(self):
        torch.manual_seed(34)
        weight = torch.randn(129, 64, dtype=torch.bfloat16)
        weight[0] = 0
        packed = PackedEmbedding.from_weight(weight)
        ids = torch.tensor([[0, 1, 128]])
        selected = torch.tensor([1, 128])
        hidden = torch.randn(2, 64)
        decoded = packed.lookup(ids)
        self.assertTrue(torch.equal(decoded[0, 0], torch.zeros(64)))
        self.assertLess(float((decoded - weight[ids].float()).abs().max()), 0.3)
        all_logits = packed.logits(hidden, chunk_rows=17)
        self.assertEqual(all_logits.shape, (2, 129))
        torch.testing.assert_close(packed.selected_logits(hidden, selected), all_logits[:, selected])
        torch.testing.assert_close(all_logits, hidden @ packed.lookup(torch.arange(129)).T)
        self.assertLess(packed.packed.numel() + 2 * packed.scales.numel(), weight.numel() * weight.element_size())

    def test_rejects_unbounded_or_invalid_input(self):
        with self.assertRaises(ValueError): PackedEmbedding.from_weight(torch.zeros(2, 63))
        with self.assertRaises(ValueError): PackedEmbedding.from_weight(torch.zeros(1001, 1000))
        packed = PackedEmbedding.from_weight(torch.zeros(2, 64))
        with self.assertRaises(ValueError): packed.logits(torch.zeros(1, 64), 0)


if __name__ == '__main__':
    unittest.main()
