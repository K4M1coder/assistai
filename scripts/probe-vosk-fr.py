"""Transcribe a local mono WAV in short chunks using the offline Vosk baseline."""
import audioop
import json
from pathlib import Path
import sys
import time
import wave

from vosk import KaldiRecognizer, Model, SetLogLevel

root = Path(__file__).resolve().parents[1]
audio = Path(sys.argv[1]) if len(sys.argv) > 1 else root / ".cache" / "french-test.wav"
model_path = root / ".cache" / "vosk" / "vosk-model-small-fr-0.22"
SetLogLevel(-1)
start = time.perf_counter()
model = Model(str(model_path))
model_load_ms = (time.perf_counter() - start) * 1000
recognizer = KaldiRecognizer(model, 16000)
partials = []
with wave.open(str(audio), "rb") as source:
    if source.getnchannels() != 1 or source.getsampwidth() != 2:
        raise ValueError("Expected a mono 16-bit PCM WAV")
    original_rate = source.getframerate()
    state = None
    start = time.perf_counter()
    while frames := source.readframes(original_rate // 10):
        converted, state = audioop.ratecv(frames, 2, 1, original_rate, 16000, state)
        if recognizer.AcceptWaveform(converted):
            partials.append(json.loads(recognizer.Result()).get("text", ""))
        else:
            partial = json.loads(recognizer.PartialResult()).get("partial", "")
            if partial and (not partials or partial != partials[-1]):
                partials.append(partial)
    final = json.loads(recognizer.FinalResult()).get("text", "")
    duration_ms = source.getnframes() / original_rate * 1000
print(json.dumps({"model_load_ms": round(model_load_ms), "audio_ms": round(duration_ms), "processing_ms": round((time.perf_counter() - start) * 1000), "partials": partials, "final": final}, ensure_ascii=False))
