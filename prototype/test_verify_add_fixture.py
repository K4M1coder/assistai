import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('verify_add_fixture', Path(__file__).resolve().parents[1] / 'scripts/verify-add-fixture.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class FixtureVerificationTests(unittest.TestCase):
    def test_accepts_addition_and_rejects_subtraction(self):
        with patch('pathlib.Path.read_text', return_value='def add(a, b):\n    return a + b\n'):
            checker.verify('unused.py')
        with patch('pathlib.Path.read_text', return_value='def add(a, b):\n    return a - b\n'):
            with self.assertRaisesRegex(ValueError, 'Arithmetic check failed'):
                checker.verify('unused.py')

    def test_rejects_calls_without_executing_them(self):
        with patch('pathlib.Path.read_text', return_value='def add(a, b):\n    return dangerous(a, b)\n'):
            with self.assertRaisesRegex(ValueError, 'Unsupported expression'):
                checker.verify('unused.py')
