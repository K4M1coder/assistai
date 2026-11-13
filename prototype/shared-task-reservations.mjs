import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// Cooperative estimates only. Orphaned reservations deliberately remain after crashes.
export function openSharedTaskReservations(path) {
  if (typeof path !== 'string' || !path || path === ':memory:') throw Error('A shared reservation database path is required');
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY, vram INTEGER NOT NULL, ram INTEGER NOT NULL, owner_pid INTEGER NOT NULL, created_at TEXT NOT NULL)');
  // Preserve ledgers created before task IDs were recorded.
  const hasTaskId = () => db.prepare('PRAGMA table_info(reservations)').all().some(column => column.name === 'task_id');
  if (!hasTaskId()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!hasTaskId()) db.exec('ALTER TABLE reservations ADD COLUMN task_id TEXT');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const totals = db.prepare('SELECT COALESCE(SUM(vram),0) AS vram, COALESCE(SUM(ram),0) AS ram FROM reservations');
  const insert = db.prepare('INSERT INTO reservations (id,vram,ram,owner_pid,created_at) VALUES (?,?,?,?,?)');
  const remove = db.prepare('DELETE FROM reservations WHERE id = ?');
  const attachTask = db.prepare('UPDATE reservations SET task_id = ? WHERE id = ? AND task_id IS NULL');
  return {
    reserve(request, check) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = totals.get();
        check({ vramBytes: Number(current.vram) + request.vramBytes, ramBytes: Number(current.ram) + request.ramBytes });
        const id = randomUUID();
        insert.run(id, request.vramBytes, request.ramBytes, process.pid, new Date().toISOString());
        db.exec('COMMIT');
        let released = false;
        const release = () => {
          if (released) return;
          try { remove.run(id); released = true; }
          catch { console.error('Could not release shared task reservation; it remains reserved.'); }
        };
        release.attachTask = taskId => {
          if (released || typeof taskId !== 'string' || !taskId.trim() || taskId.length > 200) throw Error('Invalid reservation task ID');
          if (attachTask.run(taskId, id).changes !== 1) throw Error('Reservation task ID could not be recorded');
        };
        return release;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); },
  };
}
