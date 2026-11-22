"""Guarded OpenVINO candidate initialization and optional offline speech trial."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import time
import wave

import numpy as np
import openvino as ov
import openvino_genai as genai

root = Path(__file__).resolve().parents[1]
model = root / '.cache/lfm3-omni-openvino-int4'
parser = argparse.ArgumentParser()
parser.add_argument('--infer', action='store_true')
parser.add_argument('--output', type=Path)
parser.add_argument('--stream', action='store_true')
parser.add_argument('--stop-after-first', action='store_true')
args = parser.parse_args()
if args.infer != bool(args.output): parser.error('--infer requires --output')
if args.stream and not args.infer: parser.error('--stream requires --infer')
if args.stop_after_first and not args.stream: parser.error('--stop-after-first requires --stream')
started = time.monotonic()
pipe = genai.OmniPipeline(str(model), 'GPU', ATTENTION_BACKEND='SDPA')
print(json.dumps({'pipeline_loaded':True, 'device_requested':'GPU', 'load_seconds':round(time.monotonic()-started,3),
                  'inference_performed':False}), flush=True)
if args.infer:
    path = root / '.cache/kyutai-persistent-synthetic-capital.wav'
    if hashlib.sha256(path.read_bytes()).hexdigest() != 'a59c0fb24cdac24eb28dc7103259f7f538d2a725b80565e6582400b58dd881e4':
        raise ValueError('Unexpected input fixture')
    with wave.open(str(path), 'rb') as wav:
        if (wav.getnchannels(),wav.getsampwidth(),wav.getframerate()) != (1,2,16000): raise ValueError('Unexpected input format')
        audio = np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').astype(np.float32)/32768
    history=genai.ChatHistory([{'role':'system','content':'Réponds en français avec du texte et de la voix.'},
                              {'role':'user','content':'<ov_genai_audio_0>'}])
    speech=genai.OmniTalkerSpeechConfig(); speech.return_audio=True; speech.output_mode=genai.SpeechOutputMode.INTERLEAVED
    speech.cp_temperature=0.4; speech.cp_repetition_penalty=1.2; speech.max_new_tokens=192; speech.rng_seed=0
    capture=None
    if args.stream:
        spec=importlib.util.spec_from_file_location('openvino_stream_capture',root / 'scripts/openvino-stream-capture.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        capture=module.StreamCapture(stop_after_first=args.stop_after_first)
    started=time.monotonic()
    result=pipe.generate(history,audios=[ov.Tensor(audio)],text_config=genai.GenerationConfig(max_new_tokens=128,do_sample=False),talker_speech_config=speech,**({'speech_streamer':capture} if capture else {}))
    waveforms=capture.chunks if capture else [np.asarray(item.data).reshape(-1) for item in result.speech_result.waveforms]
    if not waveforms or not all(len(item)>0 and np.isfinite(item).all() for item in waveforms): raise ValueError('Invalid generated audio')
    audio_out=np.concatenate(waveforms)
    if len(audio_out)>24000*60: raise ValueError('Generated audio exceeds one minute')
    pcm=np.rint(np.clip(audio_out,-1,32767/32768)*32768).astype('<i2')
    with args.output.open('xb') as target, wave.open(target,'wb') as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(24000); wav.writeframes(pcm.tobytes())
    print(json.dumps({'inference_performed':True,'elapsed_seconds':round(time.monotonic()-started,3),
                      'text':result.texts,'audio_samples':sum(map(len,waveforms)), 'audio_sample_rate':24000,
                      'streamed':bool(capture), 'stream_chunks':len(capture.chunks) if capture else None,
                      'first_chunk_ms':capture.first_ms if capture else None, 'requested_stop_after_first':args.stop_after_first,
                      'output_sha256':hashlib.sha256(args.output.read_bytes()).hexdigest(),
                      'physical_devices_opened':False},ensure_ascii=False),flush=True)
