// Read-only local service discovery; never return provider credentials.
export async function getServiceStatus({ voiceUrl, asrUrl, ttsUrl, opencodeUrl }, fetcher = fetch) {
  const get = async url => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    return response.json();
  };
  const models = async (role, base) => {
    try {
      const data = await get(`${base.replace(/\/$/, '')}/models`);
      return { role, server: base, available: true, models: (data.data ?? []).map(item => ({ name: String(item.id ?? '').split(/[\\/]/).pop(), engine: item.owned_by === 'llamacpp' ? 'llama.cpp' : item.owned_by || null, context: item.meta?.n_ctx ?? null })) };
    } catch { return { role, server: base, available: false, models: [] }; }
  };
  const httpAsr = new URL(asrUrl); httpAsr.protocol = httpAsr.protocol === 'wss:' ? 'https:' : 'http:'; httpAsr.pathname = '/health'; httpAsr.search = '';
  const service = async (role, url) => {
    try { const data = await get(url); return { role, server: url, available: ['ready', 'healthy', 'ok'].includes(data.status), reported: data.status ?? 'unknown', engine: data.engine ?? null, model: data.model ?? null, language: data.language ?? null }; }
    catch { return { role, server: url, available: false }; }
  };
  const voice = models('Voice controller', voiceUrl);
  const asr = service('Speech recognition', httpAsr.href);
  const tts = (async () => {
    const result = await service('Speech synthesis', `${ttsUrl.replace(/\/$/, '')}/health`);
    if (result.available) {
      try { result.engine = (await get(`${ttsUrl.replace(/\/$/, '')}/openapi.json`)).info?.title ?? null; } catch {}
    }
    return result;
  })();
  const agent = (async () => {
    if (!opencodeUrl) return { role: 'Agent model', available: false, message: 'Agent harness not configured' };
    try {
      const config = await get(`${opencodeUrl.replace(/\/$/, '')}/config`);
      const [provider] = String(config.model ?? '').split('/');
      const base = config.provider?.[provider]?.options?.baseURL;
      if (!base || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(base).hostname)) throw Error('No loopback model endpoint');
      const result = await models('Agent model', base);
      return { ...result, harness: opencodeUrl };
    } catch { return { role: 'Agent model', available: false, harness: opencodeUrl, message: 'Model endpoint unavailable or not reported' }; }
  })();
  return Promise.all([voice, agent, asr, tts]);
}
