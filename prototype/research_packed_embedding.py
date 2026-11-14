"""Small research-only INT4 tied embedding; not a production XPU implementation."""
import torch


class PackedEmbedding:
    """Symmetric groupwise INT4 with chunked logits and row-only lookup."""
    def __init__(self, packed, scales, width, group_size):
        self.packed, self.scales = packed, scales
        self.width, self.group_size = width, group_size

    @classmethod
    def from_weight(cls, weight, group_size=32):
        if weight.ndim != 2 or weight.numel() > 1_000_000:
            raise ValueError('This research probe accepts only small 2-D weights')
        rows, width = weight.shape
        if group_size <= 0 or group_size % 2 or width % group_size:
            raise ValueError('Width must be divisible by an even group size')
        groups = weight.float().reshape(rows, -1, group_size)
        scales = groups.abs().amax(dim=-1) / 7
        scales = torch.where(scales == 0, torch.ones_like(scales), scales)
        values = (groups / scales[..., None]).round().clamp(-7, 7).to(torch.int16) + 8
        values = values.reshape(rows, width)
        packed = (values[:, 0::2] | (values[:, 1::2] << 4)).to(torch.uint8)
        return cls(packed, scales.to(torch.bfloat16), width, group_size)

    def _decode(self, packed, scales):
        low = (packed & 15).to(torch.int16) - 8
        high = ((packed >> 4) & 15).to(torch.int16) - 8
        values = torch.stack((low, high), dim=-1).flatten(-2)
        groups = values.float().reshape(*values.shape[:-1], -1, self.group_size)
        return (groups * scales.float().unsqueeze(-1)).reshape(*values.shape[:-1], self.width)

    def lookup(self, token_ids):
        return self._decode(self.packed[token_ids], self.scales[token_ids])

    def selected_logits(self, hidden, token_ids):
        if token_ids.ndim != 1:
            raise ValueError('Selected token IDs must be one-dimensional')
        return hidden.float() @ self.lookup(token_ids).T

    def logits(self, hidden, chunk_rows=256):
        if chunk_rows <= 0:
            raise ValueError('Chunk size must be positive')
        outputs = []
        for start in range(0, self.packed.shape[0], chunk_rows):
            end = min(start + chunk_rows, self.packed.shape[0])
            weight = self._decode(self.packed[start:end], self.scales[start:end])
            outputs.append(hidden.float() @ weight.T)
        return torch.cat(outputs, dim=-1)
