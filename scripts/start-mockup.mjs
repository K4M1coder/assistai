// Serve the already built mockup without loading Vite's development watcher.
import { access } from 'node:fs/promises';

try { await access(new URL('../dist/index.html', import.meta.url)); }
catch { throw Error('Build the mockup first with npm run build'); }
process.env.NODE_ENV = 'production';
await import('../server.ts');
