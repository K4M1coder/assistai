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

test('reports buffered recognition mode when the provider supplies it', async () => {
  const fetcher = async url => ({ok:true,json:async()=>url.includes('/health')
    ? {status:'ready',engine:'CrispASR CPU',model:'kyutai',language:'fr',mode:'buffered-utterance'} : {data:[]}});
  const services = await getServiceStatus({voiceUrl:'http://127.0.0.1:18084/v1',asrUrl:'ws://127.0.0.1:18132/asr',ttsUrl:'http://127.0.0.1:18081'},fetcher);
  const asr = services.find(service=>service.role==='Speech recognition');
  assert.equal(asr.engine,'CrispASR CPU');
  assert.equal(asr.mode,'buffered-utterance');
});

test('redacts URL credentials, query parameters and fragments in reported endpoints', async () => {
  const fetcher = async url => {
    if (url.includes('/config')) return {ok:true,json:async()=>({model:'local/gemma',provider:{local:{options:{baseURL:'http://user:secret@127.0.0.1:18080/v1?token=secret#secret'}}}})};
    if (url.includes('/models')) return {ok:true,json:async()=>({data:[]})};
    return {ok:true,json:async()=>({status:'ready'})};
  };
  const services = await getServiceStatus({voiceUrl:'http://user:secret@127.0.0.1:18084/v1?token=secret', asrUrl:'ws://user:secret@127.0.0.1:18082/asr?token=secret', ttsUrl:'http://user:secret@127.0.0.1:18081', opencodeUrl:'http://user:secret@127.0.0.1:18085'}, fetcher);
  assert.equal(services[0].server,'http://127.0.0.1:18084/v1');
  assert.equal(services[1].server,'http://127.0.0.1:18080/v1');
  assert.equal(services[1].harness,'http://127.0.0.1:18085');
  assert.equal(services[2].server,'http://127.0.0.1:18082/health');
  assert.ok(!JSON.stringify(services).includes('secret'));
});
