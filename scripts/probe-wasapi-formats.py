"""Inspect default WASAPI device format support without opening audio streams."""
import json
import sounddevice as sd

host = next((api for api in sd.query_hostapis() if api['name'] == 'Windows WASAPI'), None)
if host is None:
    raise RuntimeError('Windows WASAPI is unavailable')
results = []
for kind in ('input', 'output'):
    device = host['default_' + kind + '_device']
    if device < 0:
        raise RuntimeError(f'No default WASAPI {kind} device')
    info = sd.query_devices(device, kind)
    supported = {}
    for rate in (16000, 24000, 48000):
        try:
            getattr(sd, 'check_' + kind + '_settings')(
                device=device, channels=1, dtype='int16', samplerate=rate,
                extra_settings=sd.WasapiSettings(auto_convert=True),
            )
            supported[str(rate)] = True
        except sd.PortAudioError:
            supported[str(rate)] = False
    results.append({'kind': kind, 'default_rate': info['default_samplerate'], 'supported_mono_pcm16_rates': supported})
print(json.dumps({'host': 'Windows WASAPI', 'devices': results, 'streams_opened': False}))
