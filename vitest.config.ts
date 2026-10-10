import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/shared/tests/**/*.test.ts', 'apps/server/tests/**/*.test.ts'], environment: 'node', coverage: { provider: 'v8' } } });
