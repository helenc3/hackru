import { expect, type Page, type Route } from '@playwright/test';
import { ActionRequestSchema, CreateSessionRequestSchema, PublicStateSchema, TurnRequestSchema, TurnResponseSchema, createBaselineState, type GameAction, type MissionId, type PublicState } from '@vibequest/shared';

export type Step = { action?: Partial<GameAction>; text?: string; patch?: Partial<PublicState>; reply?: string; feedback?: boolean; event?: string; end?: boolean };
export const fixtureState = (missionId: MissionId, validation = false): PublicState => PublicStateSchema.parse({
  ...createBaselineState(missionId), sessionId: `ui-${validation ? 'validation' : 'player'}-${missionId}`, validationMode: validation,
  zoneId: missionId === 'P1' ? 'cafe' : 'concourse', objectives: [
    { id: `${missionId.toLowerCase()}.communication`, label: 'Read the sign and communicate in Mandarin.', complete: false },
    { id: `${missionId.toLowerCase()}.arrival`, label: 'Act on the directions to reach your destination.', complete: false },
  ], timer: null,
});

/** A response tape for UI tests. It does not implement or certify the game engine or AI. */
export async function installScriptedApi(page: Page, options: { mission?: MissionId; validation?: boolean; steps?: Step[]; fixtures?: boolean } = {}) {
  let state = fixtureState(options.mission ?? 'P1', options.validation ?? false);
  const steps = [...options.steps ?? []];
  const requests: { path: string; body: unknown }[] = [];
  const failures: string[] = [];
  let failure: { status: number; code: string; message: string; retryable: boolean } | null = null;
  const sent = new Map<string, unknown>();
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/health') return json(route, { status: 'ok', buildId: 'ui-fixture', specVersion: '1.2', providers: { geminiConfigured: false, elevenlabsConfigured: false }, features: { fixtures: options.fixtures ?? true, validationHarness: options.validation ?? false }, segments: { engine: 'implemented', dialogue: 'fixture', speech: 'unimplemented' } });
    const body: unknown = request.method() === 'POST' ? request.postDataJSON() : null;
    requests.push({ path, body });
    if (failure) { const error = failure; failure = null; return json(route, { error: { code: error.code, message: error.message, retryable: error.retryable }, ...(error.status === 409 ? { state } : {}) }, error.status); }
    if (path === '/api/sessions') {
      const input = CreateSessionRequestSchema.parse(body);
      expect(input.validationMode).toBe(options.validation ?? false);
      state = PublicStateSchema.parse({ ...state, inputPreference: input.inputPreference, tier: state.mode === 'boss' ? 1 : input.initialTier });
      return json(route, { state });
    }
    if (request.method() === 'GET') return json(route, { state });
    if (path.endsWith('/actions')) {
      const input = ActionRequestSchema.parse(body);
      if (sent.has(input.actionId)) return json(route, sent.get(input.actionId));
      if (input.expectedVersion !== state.version) { failures.push(`Stale dispatch ${input.expectedVersion}, expected ${state.version}`); return json(route, { error: { code: 'STALE_VERSION', message: 'Refresh your session.', retryable: false }, state }, 409); }
      const next = steps[0];
      const matches = next?.action && Object.entries(next.action).every(([key, value]) => JSON.stringify(input.action[key as keyof GameAction]) === JSON.stringify(value));
      let patch: Partial<PublicState>;
      if (matches) { steps.shift(); patch = next.patch ?? {}; }
      else if (input.action.type === 'moveZone') patch = { zoneId: input.action.zoneId };
      else if (input.action.type === 'setInputPreference') patch = { inputPreference: input.action.preference };
      else if (['audioPhase', 'pausePractice', 'resumePractice'].includes(input.action.type)) patch = {};
      else { failures.push(`Unexpected action ${JSON.stringify(input.action)}`); return json(route, { error: { code: 'ACTION_FORBIDDEN', message: 'The mission prerequisites are not satisfied.', retryable: false } }, 422); }
      state = PublicStateSchema.parse({ ...state, ...patch, version: state.version + 1 });
      const response = { state, events: matches && next.event ? [{ id: `ui-event-${state.version}`, kind: 'objective', message: next.event }] : [] };
      sent.set(input.actionId, response);
      return json(route, response);
    }
    if (path.endsWith('/turns')) {
      const input = TurnRequestSchema.parse(body);
      if (sent.has(input.turnId)) return json(route, sent.get(input.turnId));
      expect(input.expectedVersion).toBe(state.version);
      const next = steps.shift();
      expect(next?.text).toBe(input.input.text);
      state = PublicStateSchema.parse({ ...state, ...next?.patch, version: state.version + 1 });
      const response = TurnResponseSchema.parse({ turnId: input.turnId, state, events: [], npcReply: next?.reply ?? '好的。', ...(next?.end ? { conversationEnded: true } : {}), ...(next?.feedback && state.mode !== 'boss' ? { feedback: { understood: 'Your request was understood.', explanation: 'A short, clear Mandarin request works here.', improvedExample: '请给我一杯水，谢谢。' }, vibe: { intent: .9, clarity: .8, courtesy: .8 } } : {}) });
      sent.set(input.turnId, response);
      return json(route, response);
    }
    return json(route, { error: { code: 'NOT_IMPLEMENTED', message: 'Voice fixtures do not contact paid providers.', retryable: false } }, 501);
  });
  return { requests, failures, remaining: () => steps.length, state: () => state, failNext: (error: NonNullable<typeof failure>) => { failure = error; }, patch: (patch: Partial<PublicState>) => { state = PublicStateSchema.parse({ ...state, ...patch }); } };
}
