import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('local model probe verifies tool name, arguments and all requested cities', async t => {
  let invalid = false, count = 0;
  const server = http.createServer((req, res) => {
    req.resume();
    const city = ['Paris', 'Lyon', 'Nantes'][count++ % 3];
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name:'get_weather', arguments: JSON.stringify({city: invalid ? 'Paris' : city}) } }] } }] }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function run() {
    const child = spawn(process.execPath, ['scripts/probe-local-model.mjs'], { env:{...process.env, LOCAL_MODEL_URL:`http://127.0.0.1:${server.address().port}/v1`}, stdio:['ignore','pipe','pipe'], windowsHide:true });
    let output=''; child.stdout.on('data', chunk => { output += chunk; });
    const [exit] = await once(child, 'exit');
    return { exit, rows: output.trim().split('\n').map(line => JSON.parse(line)) };
  }
  const valid = await run();
  assert.equal(valid.exit, 0);
  assert.ok(valid.rows.every(row => row.validToolCall));
  invalid = true;
  const wrongCity = await run();
  assert.equal(wrongCity.exit, 1);
  assert.equal(wrongCity.rows[1].validToolCall, false);
});
