import { setTimeout } from 'node:timers/promises';

const healthUrl = 'http://127.0.0.1:3001/api/health';
const deadline = Date.now() + 30_000;
let ready = false;

console.info('Waiting for the API before starting Vite…');
while (Date.now() < deadline) {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1000) });
    const health = await response.json();
    if (response.ok && health.status === 'ok') {
      ready = true;
      break;
    }
  } catch {
    // The API may still be starting; retry until the startup deadline.
  }
  await setTimeout(200);
}

if (!ready) {
  console.error(`API did not become ready at ${healthUrl}. Check the API startup logs and PORT=3001.`);
  process.exitCode = 1;
}
