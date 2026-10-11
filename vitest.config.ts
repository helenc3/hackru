import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['apps/web/tests/**/*.test.ts', 'packages/shared/tests/**/*.test.ts', 'apps/server/tests/**/*.test.ts'], environment: 'node', ...(process.env.VITEST_JSON_OUTPUT ? { reporters: ['default', 'json'], outputFile: { json: process.env.VITEST_JSON_OUTPUT } } : {}) } });
