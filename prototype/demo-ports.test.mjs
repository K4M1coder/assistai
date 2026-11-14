import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('Windows benchmark guard discovers new demo ports and rejects invalid records', {skip:process.platform !== 'win32'}, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'assistai-demo-ports-'));
  const record = path.join(directory, 'demo-18123-processes.json');
  const run = () => spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',
    ". ./scripts/get-demo-ports.ps1; @(Get-DemoPorts $env:ASSISTAI_TEST_RECORDS) | ConvertTo-Json -Compress"],
    {cwd:process.cwd(),env:{...process.env,ASSISTAI_TEST_RECORDS:directory},encoding:'utf8'});
  try {
    await writeFile(record, JSON.stringify({port:18123}));
    const valid=run(); assert.equal(valid.status,0,valid.stderr);
    assert.ok(JSON.parse(valid.stdout).includes(18123));
    await writeFile(record, JSON.stringify({port:18124}));
    const invalid=run(); assert.notEqual(invalid.status,0);
  } finally { await unlink(record); await rmdir(directory); }
});
