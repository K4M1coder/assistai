import { createInterface } from 'node:readline/promises';

// Only for an operator-attended disposable-fixture probe; never auto-approve.
export async function askProbeApproval(event, input = process.stdin, output = process.stderr) {
  if (!input.isTTY || typeof event?.approval_id !== 'string' || typeof event.task !== 'string') return false;
  const safe = value => String(value ?? 'Unavailable').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  output.write(`\nOriginal request: ${safe(event.original_request)}\nProposed task: ${safe(event.task)}\n`);
  output.write('Approve only after checking the disposable workspace, filename, operation and scope.\n');
  const reader = createInterface({ input, output });
  try { return (await reader.question('Approve this fixture task? [y/N] ')).trim().toLowerCase() === 'y'; }
  catch { return false; }
  finally { reader.close(); }
}
