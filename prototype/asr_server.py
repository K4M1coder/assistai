"""Local streaming ASR sidecar. The WebSocket accepts mono 16 kHz PCM16LE."""
import asyncio
import json
import os
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from vosk import KaldiRecognizer, Model, SetLogLevel

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = Path(os.environ.get("ASSISTAI_VOSK_MODEL", ROOT / ".cache/vosk/vosk-model-small-fr-0.22"))
SAMPLE_RATE = 16000
MAX_AUDIO_BYTES = SAMPLE_RATE * 2  # One second maximum per WebSocket message.
app = FastAPI()
model: Model | None = None


@app.on_event("startup")
def load_model() -> None:
    global model
    if not MODEL_PATH.is_dir():
        raise RuntimeError(f"ASR model missing: {MODEL_PATH}. Run scripts/setup-vosk-fr.py first.")
    SetLogLevel(-1)
    model = Model(str(MODEL_PATH))


@app.get("/health")
async def health() -> dict:
    return {"status": "ready" if model else "loading", "engine": "Vosk", "model": MODEL_PATH.name, "language": "fr", "sample_rate": SAMPLE_RATE}


@app.websocket("/asr")
async def asr(socket: WebSocket) -> None:
    await socket.accept()
    if model is None:
        await socket.close(code=1013, reason="Model not ready")
        return
    recognizer = KaldiRecognizer(model, SAMPLE_RATE)
    last_partial = ""
    await socket.send_json({"type": "ready", "language": "fr", "sample_rate": SAMPLE_RATE})
    try:
        while True:
            event = await socket.receive()
            if event["type"] == "websocket.disconnect":
                break
            data = event.get("bytes")
            if data is not None:
                if not data or len(data) > MAX_AUDIO_BYTES or len(data) % 2:
                    await socket.close(code=1003, reason="Expected bounded PCM16 audio")
                    break
                complete = await asyncio.to_thread(recognizer.AcceptWaveform, data)
                if complete:
                    result = json.loads(recognizer.Result()).get("text", "")
                    last_partial = ""
                    if result:
                        await socket.send_json({"type": "segment", "text": result})
                else:
                    partial = json.loads(recognizer.PartialResult()).get("partial", "")
                    if partial != last_partial:
                        last_partial = partial
                        await socket.send_json({"type": "partial", "text": partial})
                continue
            try:
                control = json.loads(event.get("text") or "")
            except json.JSONDecodeError:
                await socket.close(code=1003, reason="Invalid control message")
                break
            if control.get("type") == "end":
                final = json.loads(recognizer.FinalResult()).get("text", "")
                await socket.send_json({"type": "final", "text": final})
                recognizer = KaldiRecognizer(model, SAMPLE_RATE)
                last_partial = ""
            elif control.get("type") == "reset":
                recognizer = KaldiRecognizer(model, SAMPLE_RATE)
                last_partial = ""
                await socket.send_json({"type": "reset"})
            else:
                await socket.close(code=1003, reason="Unknown control message")
                break
    except WebSocketDisconnect:
        pass
