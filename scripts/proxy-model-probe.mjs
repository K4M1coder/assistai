// Local disposable proxy for synthetic fixture traffic only; records request JSON in .cache.
import http from 'node:http';
import { appendFile } from 'node:fs/promises';

http.createServer(async (req, res) => {
  try {
    const parts = [];
    for await (const part of req) parts.push(part);
    const body = Buffer.concat(parts);
    if (req.method === 'POST') await appendFile('.cache/agent-coding-probe/requests.jsonl', `${body.toString('utf8')}\n`);
    const upstream = await fetch(`http://127.0.0.1:18080${req.url}`, { method: req.method, headers: { 'content-type': req.headers['content-type'] ?? 'application/json' }, ...(body.length ? { body } : {}) });
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
    if (upstream.body) for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (error) { res.writeHead(502).end(String(error)); }
}).listen(18090, '127.0.0.1', () => console.log('Fixture-only proxy listening on 18090'));
