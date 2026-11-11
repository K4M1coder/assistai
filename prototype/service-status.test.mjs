import test from 'node:test';
import assert from 'node:assert/strict';
import { getServiceStatus } from './service-status.mjs';

test('reports models and service availability without exposing provider credentials', async () => {
  const fetcher = async url => {
    if (url.endsWith('/config')) return { ok: true, json: async () => ({ model: 'local/gemma', provider: { local: { options: { baseURL: 'http://127.0.0.1:18080/v1', apiKey: 'secret' } } } }) };
    if (url.includes('18082')) return { ok: true, json: async () => ({ status: 'ready', engine: 'Vosk', model: 'fr-model', language: 'fr' }) };
    if (url.includes('18081')) throw Error('offline');
    return { ok: true, json: async () => ({ data: [{ id: 'C:\\models\\gemma.gguf', owned_by: 'llamacpp', meta: { n_ctx: 8192 } }] }) };
  };
  const services = await getServiceStatus({ voiceUrl: 'http://127.0.0.1:18084/v1', asrUrl: 'ws://127.0.0.1:18082/asr', ttsUrl: 'http://127.0.0.1:18081', opencodeUrl: 'http://127.0.0.1:18085' }, fetcher);
  assert.equal(services[0].models[0].name, 'gemma.gguf');
  assert.equal(services[0].models[0].engine, 'llama.cpp');
  assert.equal(services[1].server, 'http://127.0.0.1:18080/v1');
  assert.equal(services[2].available, true);
  assert.equal(services[2].engine, 'Vosk');
  assert.equal(services[3].available, false);
  assert.ok(!JSON.stringify(services).includes('secret'));
});

test('native mode reports only the configured parallel transcription engine', async () => {
  const requested = [];
  const fetcher = async url => {
    requested.push(url);
    if (url.includes(':18111/health')) return { ok: true, json: async () => ({ status: 'ready', engine: 'Vosk', model: 'french', language: 'fr' }) };
    if (url.endsWith('/models')) return { ok: true, json: async () => ({ data: [{ id: 'speech.gguf', owned_by: 'llamacpp' }] }) };
    throw Error('Unexpected request');
  };
  const config = { voiceUrl: 'http://127.0.0.1:18092/v1', asrUrl: 'ws://127.0.0.1:18082/asr', ttsUrl: 'http://127.0.0.1:18081', nativeSpeech: true };
  const withTranscript = await getServiceStatus({ ...config, nativeTranscriptUrl: 'ws://127.0.0.1:18111/asr' }, fetcher);
  assert.equal(withTranscript[0].role, 'Speech-to-speech model');
  assert.equal(withTranscript[0].models[0].engine, 'llama.cpp');
  assert.deepEqual(withTranscript[2], { role: 'Parallel transcription', server: 'http://127.0.0.1:18111/health', available: true, reported: 'ready', engine: 'Vosk', model: 'french', language: 'fr' });
  assert.ok(!requested.some(url => url.includes(':18081') || url.includes(':18082')));
  requested.length = 0;
  const withoutTranscript = await getServiceStatus(config, fetcher);
  assert.deepEqual(withoutTranscript.map(item => item.role), ['Speech-to-speech model', 'Agent model']);
  assert.ok(!requested.some(url => url.includes(':18081') || url.includes(':18082')));
});
