"""Check the pinned upstream session's context lifecycle with a fake model.

This requires the isolated Haru research environment and checkout. It does not
run trained weights, produce audio or test the correctness of model responses.
"""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.cache/haru-research/haru'))
from haru.session import DuplexSession  # noqa: E402


class FakeModel:
    def __init__(self):
        self.config = SimpleNamespace()
        self.codec = SimpleNamespace(sample=lambda latent, generator: latent)
        self.tokenizer = object()
        self.caches = []
        self.calls = []

    def new_cache(self):
        cache = object()
        self.caches.append(cache)
        return cache

    def embed(self, *args):
        return torch.zeros(1, 1, 2)

    def __call__(self, embeddings, cache):
        self.calls.append(cache)
        return embeddings


class SessionContractTest(unittest.TestCase):
    def test_prompt_only_used_at_start_and_restart_replaces_cache(self):
        model = FakeModel()
        session = DuplexSession.__new__(DuplexSession)
        session.model = model
        session.config = SimpleNamespace(seed=4, speak_first=False)
        session.system_prompt = 'initial card'
        session.reference = None
        session.frame_samples = 4
        session._generator = torch.Generator()
        session._codec = SimpleNamespace(reset=lambda: None, encode=lambda audio: torch.zeros(1, 2))
        session._latent = torch.zeros(1, 2)
        session._token = torch.tensor([1])
        session._emit = lambda hidden, started: None
        prompt = SimpleNamespace(length=1, **{key: torch.zeros(1) for key in
            ('tokens', 'model_latents', 'user_latents', 'model_mask', 'user_mask')})
        with patch('haru.session.build_prompt', return_value=prompt) as build:
            session.start()
            first_cache = session._cache
            self.assertEqual(build.call_args.args[3], 'initial card')
            session.system_prompt = 'updated card'
            session.step(torch.zeros(4))
            self.assertEqual(build.call_count, 1)
            self.assertIs(model.calls[-1], first_cache)
            session.start()
            self.assertEqual(build.call_count, 2)
            self.assertEqual(build.call_args.args[3], 'updated card')
            self.assertIsNot(session._cache, first_cache)


if __name__ == '__main__':
    unittest.main()
