"""Download the pinned native duplex model files and verify their SHA-256 hashes."""
import hashlib
from pathlib import Path
from huggingface_hub import hf_hub_download

ROOT = Path(__file__).resolve().parents[1]
REPO = 'openbmb/MiniCPM-o-4_5-gguf'
REVISION = '47eeee5b877167846601d816a192f9a2ee62fc25'
FILES = {
    'MiniCPM-o-4_5-Q4_K_M.gguf': '1237a97ee081b8abebc47aa7dad565701e8f5f904cdc92f6723ac4281bbc0932',
    'audio/MiniCPM-o-4_5-audio-F16.gguf': 'd5b188ac7feaf98e17175c3f9bd14bf269301bfd187439fdaa3e3a494fc32ef7',
    'tts/MiniCPM-o-4_5-tts-F16.gguf': 'c7be3748a863dd6966ae7eed42600b7f41ca67affb03729ff245247f0e5ea088',
    'tts/MiniCPM-o-4_5-projector-F16.gguf': '4b1b5b377358a5e594a304ff6ea5d52df606a9ba7d886c4299d232f0c67dd1fd',
    'vision/MiniCPM-o-4_5-vision-F16.gguf': '1453678cc4e4fe18de241952962e234f265cb8dda780773526103ab8ba82f421',
    'token2wav-gguf/encoder.gguf': '7f8d265da594eaf5e1de2db8f5f1867dbcb0bb75ef5878fadf2952347116f4d0',
    'token2wav-gguf/flow_matching.gguf': 'eda6069f3edeb5dd3a87fbf2aedb2ddd1b46f3273926c4fcf09b24476a39cab8',
    'token2wav-gguf/flow_extra.gguf': 'c67611aa7d02500fe395a7798bf0bfdfb55c74d37ba93934ca74d82b4e63f78d',
    'token2wav-gguf/hifigan2.gguf': '1b8b3bf5d8d3066aeee4324fdcdd41aefce170d0ee907645858de408d82835c2',
    'token2wav-gguf/prompt_cache.gguf': '81fe6f541ebe0b67db06a1e395df928da47991dc9637c2cf47d6c59d5b979f2c',
}
for filename, expected in FILES.items():
    path = Path(hf_hub_download(repo_id=REPO, revision=REVISION, filename=filename, local_dir=ROOT / '.cache/minicpm-omni'))
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(4 * 1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != expected:
        raise RuntimeError(f'Checksum mismatch: {filename}')
    print(f'Verified {filename}', flush=True)
