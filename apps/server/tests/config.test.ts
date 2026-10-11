import { describe, expect, it } from 'vitest';
import { loadConfig, validationHarnessEnabled } from '../src/config.js';

describe('server-only configuration', () => {
  it('pins safe local defaults and separates production and development ports', () => {
    expect(loadConfig({})).toMatchObject({
      nodeEnv: 'development', host: '127.0.0.1', port: 3001,
      enableDemoFixtures: false, enableValidationHarness: false,
      geminiModel: 'gemini-3.8-flash', elevenlabsTtsModel: 'eleven_v4_turbo',
      elevenlabsPaModel: 'eleven_v4', elevenlabsSttModel: 'scribe_v2',
    });
    expect(loadConfig({ NODE_ENV: 'production' }).port).toBe(4173);
    expect(loadConfig({ PORT: '5050' }).port).toBe(5050);
  });

  it('treats empty optional credential settings as unconfigured', () => {
    const config = loadConfig({ GEMINI_API_KEY: ' ', ELEVENLABS_API_KEY: '' });
    expect(config.geminiApiKey).toBeUndefined();
    expect(config.elevenlabsApiKey).toBeUndefined();
  });

  it('parses bounded flags without the truthy-string false trap', () => {
    expect(loadConfig({ ENABLE_DEMO_FIXTURES: 'false' }).enableDemoFixtures).toBe(false);
    expect(loadConfig({ ENABLE_DEMO_FIXTURES: '0' }).enableDemoFixtures).toBe(false);
    expect(loadConfig({ ENABLE_DEMO_FIXTURES: 'true' }).enableDemoFixtures).toBe(true);
    expect(loadConfig({ ENABLE_VALIDATION_HARNESS: '1' }).enableValidationHarness).toBe(true);
    expect(validationHarnessEnabled(loadConfig({ NODE_ENV: 'production', ENABLE_VALIDATION_HARNESS: 'true' }))).toBe(false);
  });

  it('rejects invalid settings without including environment values in errors', () => {
    expect(() => loadConfig({ PORT: '70000', GEMINI_API_KEY: 'configuration-test-secret' }))
      .toThrow('Invalid server configuration: PORT');
    expect(() => loadConfig({ ENABLE_DEMO_FIXTURES: 'perhaps' }))
      .toThrow('Invalid server configuration: ENABLE_DEMO_FIXTURES');
  });
});
