import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('gateway reports a configured low-resource sample with admission disabled', { timeout: 10000 }, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'assistai-resource-test-'));
  const file = path.join(dir, 'sample.json');
  await writeFile(file, JSON.stringify({ observedAt: new Date().toISOString(), dedicatedBytes: 15 * 1024 ** 3,
    sharedBytes: 1024, availableRamBytes: 4 * 1024 ** 3 }));
  const reservation = http.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['prototype/gateway.mjs'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ASSISTAI_GATEWAY_PORT: String(port), ASSISTAI_DB_PATH: ':memory:',
      ASSISTAI_RESOURCE_STATUS_PATH: file, ASSISTAI_BUDGET_SAMPLE_PATH: '', ASSISTAI_LFM_REALTIME_URL: '' } });
  let error = ''; child.stderr.on('data', data => { error += data; });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } await unlink(file); await rmdir(dir); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Startup timed out: ${error}`)), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Gateway exited ${code}: ${error}`)); });
    child.stdout.on('data', data => { if (data.toString().includes('Experimental voice gateway')) { clearTimeout(timer); resolve(); } });
  });
  const response = await fetch(`http://127.0.0.1:${port}/resources`);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, 'low');
  assert.equal(result.admission, 'disabled');
  assert.equal(result.hard_limit_enforced, false);
  assert.ok(!JSON.stringify(result).includes(file));
});
