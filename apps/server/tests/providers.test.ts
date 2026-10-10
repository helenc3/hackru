import { describe, expect, it } from 'vitest';
import type { TurnContext } from '@vibequest/shared';
import { loadConfig } from '../src/config.js';
import { createServices } from '../src/services.js';

describe('injected bootstrap services', () => {
  it('keeps provider stubs while supplying real session storage', async () => {
    const services = createServices(loadConfig({
      NODE_ENV: 'test', ELEVENLABS_API_KEY: 'fixture-key',
    }));
    const context: TurnContext = {
      missionId: 'P1', mode: 'practice', tier: 0, npcId: 'xiaolin',
      persona: 'warm café clerk', patience: 1, allowedIntents: ['greeting', 'unknown'],
      facts: {}, history: [],
    };
    await expect(services.dialogueProvider.evaluate(context, '你好')).rejects.toMatchObject({
      status: 503, code: 'PROVIDER_UNAVAILABLE', retryable: true,
    });
    await expect(services.speechProvider.synthesize('你好', 'xiaolin')).rejects.toMatchObject({
      status: 501, code: 'SEGMENT_NOT_IMPLEMENTED', message: expect.stringContaining('Segment-005'),
    });
    await expect(services.speechProvider.transcribe(new Uint8Array(), 'audio/webm')).rejects.toMatchObject({
      status: 501, code: 'SEGMENT_NOT_IMPLEMENTED', message: expect.stringContaining('Segment-005'),
    });
    await expect(services.sessionStore.get('bootstrap-session')).resolves.toBeUndefined();
  });
});
