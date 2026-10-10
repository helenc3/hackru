import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp({ config });
const server = app.listen(config.port, config.host, () => {
  console.info(`VibeQuest server listening at http://${config.host}:${config.port}`);
});

server.on('error', () => {
  console.error('VibeQuest server could not start. Check the configured port.');
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
  });
}
