"""Check exact words in an already installed Vosk model; performs no recognition."""
import argparse
import json
from pathlib import Path

from vosk import Model, SetLogLevel

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORDS = ('fixture', 'calculator', 'calculateur', 'py', 'texte', 'fichier', 'addition', 'soustraction', 'pas')


def check_words(model, words):
    return {word: model.vosk_model_find_word(word) >= 0 for word in words}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=Path, default=ROOT / '.cache/vosk/vosk-model-small-fr-0.22')
    parser.add_argument('words', nargs='*', default=DEFAULT_WORDS)
    args = parser.parse_args()
    if not args.model.is_dir():
        raise SystemExit('Expected an existing local Vosk model directory')
    SetLogLevel(-1)
    model = Model(str(args.model))
    print(json.dumps({'model': args.model.name, 'exact_word_present': check_words(model, args.words),
                      'recognition_performed': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()
