import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { openSharedTaskReservations } from './shared-task-reservations.mjs';
import { createTaskAdmission } from './task-admission.mjs';
import { inspectReservations, releaseVerifiedReservation } from '../scripts/inspect-task-reservations.mjs';

test('separate gateway coordinators share estimates and retain orphaned reservations', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'assistai-reservations-'));
  const db = path.join(directory, 'reservations.sqlite');
  const a = openSharedTaskReservations(db), b = openSharedTaskReservations(db);
  const GiB = 1024 ** 3;
  const sample = { observedAt: '2026-01-01T00:00:00Z', dedicatedBytes: 20 * GiB, sharedBytes: 0, availableRamBytes: 12 * GiB };
  const options = { samplePath: 'sample', baselineSharedBytes: 0, requestedVramBytes: 1.5 * GiB, requestedRamBytes: GiB,
    now: () => Date.parse(sample.observedAt), read: async () => JSON.stringify(sample) };
  try {
    const admitA = createTaskAdmission({ ...options, sharedReservations: a });
    const admitB = createTaskAdmission({ ...options, sharedReservations: b });
    const release = await admitA();
    release.attachTask('session-one');
    assert.throws(() => release.attachTask('session-two'), /could not be recorded/);
    assert.equal(inspectReservations(db)[0].taskId, 'session-one');
    await assert.rejects(admitB(), /budget/);
    release(); release();
    assert.deepEqual(inspectReservations(db), []);
    await admitB(); // Deliberately leave this reservation orphaned.
    const orphan = inspectReservations(db)[0].reservationId;
    b.close();
    const restarted = openSharedTaskReservations(db);
    try {
      await assert.rejects(createTaskAdmission({ ...options, sharedReservations: restarted })(), /budget/);
      assert.throws(() => releaseVerifiedReservation(db, 'bad'), /UUID/);
      assert.equal(releaseVerifiedReservation(db, orphan), true);
      assert.equal(releaseVerifiedReservation(db, orphan), false);
      const newRelease = await createTaskAdmission({ ...options, sharedReservations: restarted })();
      newRelease();
    }
    finally { restarted.close(); }
  } finally {
    a.close();
    await unlink(db); await rmdir(directory);
  }
});

test('two processes cannot both reserve beyond the same budget', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'assistai-reservations-process-'));
  const db = path.join(directory, 'reservations.sqlite');
  const initializer = openSharedTaskReservations(db); initializer.close();
  const script = `import { openSharedTaskReservations } from './prototype/shared-task-reservations.mjs';
    const store=openSharedTaskReservations(process.argv[1]);
    try { store.reserve({vramBytes:2,ramBytes:1}, total=>{if(total.vramBytes>3)throw Error('full')}); console.log('accepted'); }
    catch { console.log('rejected'); } finally {store.close();}`;
  const run = promisify(execFile);
  try {
    const values = await Promise.all([run(process.execPath, ['--input-type=module', '-e', script, db]),
      run(process.execPath, ['--input-type=module', '-e', script, db])]);
    assert.deepEqual(values.map(value => value.stdout.trim()).sort(), ['accepted', 'rejected']);
  } finally { await unlink(db); await rmdir(directory); }
});

test('upgrades an old ledger without dropping retained reservations', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'assistai-reservations-migration-'));
  const file = path.join(directory, 'reservations.sqlite');
  const old = new DatabaseSync(file);
  old.exec("CREATE TABLE reservations (id TEXT PRIMARY KEY, vram INTEGER NOT NULL, ram INTEGER NOT NULL, owner_pid INTEGER NOT NULL, created_at TEXT NOT NULL); INSERT INTO reservations VALUES ('old', 10, 20, 123, '2026-01-01T00:00:00Z')");
  old.close();
  try {
    assert.equal(inspectReservations(file)[0].taskId, null);
    const upgraded = openSharedTaskReservations(file);
    assert.equal(inspectReservations(file)[0].reservationId, 'old');
    upgraded.close();
  } finally { await unlink(file); await rmdir(directory); }
});
