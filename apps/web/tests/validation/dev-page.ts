import { test as base } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

export const test = base.extend<object, { devUrl: string }>({
  devUrl: [async ({ browserName: _browserName }, use) => {
    const webRoot = fileURLToPath(new URL('../..', import.meta.url));
    const vite = fileURLToPath(new URL('../../../../node_modules/vite/bin/vite.js', import.meta.url));
    const allocator = createServer();
    await new Promise<void>((resolve) => allocator.listen(0, '127.0.0.1', resolve));
    const address = allocator.address();
    if (!address || typeof address === 'string') throw new Error('Cannot allocate development test port.');
    const port = address.port;
    await new Promise<void>((resolve, reject) => allocator.close((error) => error ? reject(error) : resolve()));
    const child: ChildProcess = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: webRoot, env: { ...process.env, VITE_ENABLE_VALIDATION_HARNESS: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = '';
    child.stdout?.on('data', (data) => { logs += String(data); });
    child.stderr?.on('data', (data) => { logs += String(data); });
    const url = `http://127.0.0.1:${port}`;
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (child.exitCode !== null) throw new Error(`Development server failed: ${logs}`);
        try { ready = (await fetch(url)).ok; } catch { /* startup */ }
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!ready) throw new Error(`Development server did not start: ${logs}`);
      await use(url);
    } finally {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => { if (child.exitCode !== null) resolve(); else { const deadline = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 1500); child.once('exit', () => { clearTimeout(deadline); resolve(); }); } });
    }
  }, { scope: 'worker' }],
});
export { expect } from '@playwright/test';
