import { describe, expect, it } from 'vitest';
import type { TurnContext } from '@vibequest/shared';
import { loadConfig } from '../src/config.js';
import { createServices } from '../src/services.js';

describe('injected bootstrap services', () => {
  it('keeps provider stubs while supplying real session storage', async () => {
    const services = createServices(loadConfig({
      NODE_ENV: 'test',
    }));
    const context: TurnContext = {
      missionId: 'Q1', mode: 'practice', tier: 0, npcId: 'vendor', anchorId: 'an.vendor.0-0', nameZh: '小林',
      persona: 'warm café clerk', patience: 1, allowedIntents: ['greeting', 'unknown'],
      facts: {}, history: [],
    };
    await expect(services.dialogueProvider.evaluate(context, '你好')).rejects.toMatchObject({
      status: 503, code: 'PROVIDER_UNAVAILABLE', retryable: true,
    });
    await expect(services.speechProvider.synthesize('你好', 'vendor')).rejects.toMatchObject({
      status: 503, code: 'SPEECH_UNAVAILABLE', retryable: true,
    });
    await expect(services.speechProvider.transcribe(new Uint8Array(), 'audio/webm')).rejects.toMatchObject({
      status: 503, code: 'TRANSCRIPTION_UNAVAILABLE', retryable: true,
    });
    await expect(services.sessionStore.get('bootstrap-session')).resolves.toBeUndefined();
  });
});
