import { test, expect } from 'vitest';
import { createSessionClient, SessionClientError } from '../../src/app/session-client';
import type { ActionRequest, TurnRequest } from '@vibequest/shared';
import { fixtureState } from '../../../../fixtures/ui/scripted-api';

const baselineActionRequest: ActionRequest = { actionId: 'fixture-action-001', expectedVersion: 0, action: { type: 'move', position: { x: 20, z: 21 } } };
const baselineActionResponse = { state: fixtureState('Q1'), events: [] };
const baselineTurnRequest: TurnRequest = { turnId: 'fixture-turn-001', expectedVersion: 0, npcId: 'vendor', anchorId: 'ui.vendor', input: { text: '我要水。', source: 'typed' } };

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('transport validates responses and deduplicates committed event delivery', async () => {
  const calls: RequestInit[] = [];
  const result = { ...baselineActionResponse, events: [{ id: 'reward-once', kind: 'reward', message: 'One reward.' }] };
  const client = createSessionClient({ fetch: (async (_url, init) => { calls.push(init!); return response(result); }) as typeof fetch });
  const events: string[] = [];
  client.subscribe('fixture-session', () => { throw new Error('Observer failed'); });
  const unsubscribe = client.subscribe('fixture-session', (event) => events.push(event.id));
  await client.act('fixture-session', baselineActionRequest); await client.act('fixture-session', baselineActionRequest); unsubscribe();
  expect(events).toEqual(['reward-once']); expect(calls).toHaveLength(2);
  expect(JSON.parse(calls[0].body as string)).toEqual(baselineActionRequest);
});
test('transport rejects responses that leak private state or break the contract', async () => {
  const leaked = { turnId: 'fixture-turn-001', state: { ...fixtureState('Q1'), secretFacts: { teaPriceCny: '10' } }, events: [], npcReply: '好的。' };
  const client = createSessionClient({ fetch: (async () => response(leaked)) as typeof fetch });
  await expect(client.sendTurn('fixture-session', baselineTurnRequest)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
  // An anchorless turn never leaves the client.
  await expect(client.sendTurn('fixture-session', { ...baselineTurnRequest, anchorId: undefined } as unknown as TurnRequest)).rejects.toThrow();
});
test('transport distinguishes network, timeout and malformed response failures', async () => {
  const offline = createSessionClient({ fetch: (async () => { throw new TypeError('Network failed'); }) as typeof fetch });
  await expect(offline.getState('fixture-session')).rejects.toMatchObject({ code: 'OFFLINE', retryable: true });
  const timeout = createSessionClient({ timeoutMs: 5, fetch: ((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('Aborted'))))) as typeof fetch });
  await expect(timeout.getState('fixture-session')).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true });
  const malformed = createSessionClient({ fetch: (async () => new Response('<html>unavailable</html>', { status: 503 })) as typeof fetch });
  await expect(malformed.getState('fixture-session')).rejects.toBeInstanceOf(SessionClientError);
});
