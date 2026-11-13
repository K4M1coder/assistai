// Read-only diagnostic; a process ID alone does not prove an agent task has stopped.
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function inspectReservations(path) {
  if (!existsSync(path)) throw Error('Reservation database does not exist');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const columns = db.prepare('PRAGMA table_info(reservations)').all();
    const hasTaskId = columns.some(column => column.name === 'task_id');
    const rows = db.prepare(`SELECT id, vram, ram, owner_pid, created_at${hasTaskId ? ', task_id' : ''} FROM reservations ORDER BY created_at`).all();
    return rows.map(row => ({ reservationId: row.id, taskId: hasTaskId ? row.task_id : null,
      ownerPid: row.owner_pid, createdAt: row.created_at, estimatedVramBytes: row.vram, estimatedRamBytes: row.ram }));
  } finally { db.close(); }
}

export function releaseVerifiedReservation(path, id) {
  if (!existsSync(path)) throw Error('Reservation database does not exist');
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw Error('A complete reservation UUID is required');
  const db = new DatabaseSync(path);
  try { return db.prepare('DELETE FROM reservations WHERE id = ?').run(id).changes === 1; }
  finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = resolve(process.argv[2] ?? '.cache/assistant/task-reservations.sqlite');
  const args = process.argv.slice(3);
  if (args.length) {
    if (args.length !== 3 || args[0] !== '--release' || args[2] !== '--confirmed-stopped') throw Error('Expected --release UUID --confirmed-stopped');
    if (!releaseVerifiedReservation(path, args[1])) throw Error('Reservation was not found');
    console.log('Reservation released. This did not stop a task or free physical memory.');
  } else console.log(JSON.stringify({ reservations: inspectReservations(path),
    note: 'Read-only. Process IDs may be reused; confirm task status with the correct harness before any manual reconciliation.' }, null, 2));
}
