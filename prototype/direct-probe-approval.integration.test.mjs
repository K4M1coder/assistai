import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';

test('direct harness probes refuse unattended execution before any harness request', { timeout: 15000 }, async t => {
  let requests = 0;
  const server = http.createServer((_req, res) => { requests++; res.writeHead(500).end(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['probe-agent-edit.mjs', 'probe-parallel-models.mjs', 'probe-lfm-session-delegation.mjs', 'probe-lfm3-voice-delegation.mjs']) {
    const child = spawn(process.execPath, [`scripts/${name}`], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
      env: { ...process.env, ASSISTAI_OPENCODE_URL: base, OPENCODE_URL: base } });
    let error = ''; child.stderr.on('data', data => { error += data; });
    const [code] = await once(child, 'exit');
    assert.notEqual(code, 0, name);
    assert.match(error, /interactive terminal/, name);
  }
  assert.equal(requests, 0);
});
