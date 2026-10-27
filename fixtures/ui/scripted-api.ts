import { expect, type Page, type Route } from '@playwright/test';
import {
  worldText, ActionRequestSchema, ChunkRequestSchema, ChunkRestoreRequestSchema, CreateSessionRequestSchema, PublicStateSchema, TurnRequestSchema, TurnResponseSchema,
  generateFallbackChunk, seedFromWorldId, type GameAction, type MissionId, type PublicState,
} from '@vibequest/shared';

/** `patch.npcActions` sets the buttons in state; a turn's response carries the ones for the NPC it addressed (plus End conversation when `end`). */
export type Step = { action?: Partial<GameAction>; text?: string; patch?: Partial<PublicState>; reply?: string; feedback?: boolean; event?: string; end?: boolean };
const roles = { Q1: ['vendor', '老王'], Q2: ['guide', '小李'], Q3: ['passerby', '小美'] } as const;
const spawn = { x: 20, z: 20 };
const goals = { Q1: 'Buy a drink from 老王 (Lao Wang).', Q2: 'Ask 小李 (Xiao Li) how to get to 上海大酒店 (Shanghai Grand Hotel).', Q3: 'Ask a passer-by at the Huangpu River (黄浦江) to take your photo.' } as const;
/** Anchors sit at the player's position so dock buttons appear without walking. */
export const fixtureState = (missionId: MissionId, validation = false): PublicState => PublicStateSchema.parse({
  sessionId: `ui-${validation ? 'validation' : 'player'}-${missionId}`, worldId: 'ui-world', version: 0, missionId, mode: 'practice', status: 'active', zoneId: 'shopping', position: spawn, tier: 0,
  objectives: [{ id: `${missionId.toLowerCase()}.goal`, label: goals[missionId], complete: false }],
  interactables: [
    { id: `ui.${roles[missionId][0]}`, kind: 'npc', role: roles[missionId][0], label: roles[missionId][1], position: spawn },
  ],
  npcMood: { vendor: 'warm', guide: 'warm', passerby: 'warm' }, inventory: { hint: 1, cny: 20, drinks: [] }, purchases: [],
  xp: 0, badges: [], unlockedMissionIds: ['Q1', 'Q2', 'Q3'].slice(0, ['Q1', 'Q2', 'Q3'].indexOf(missionId) + 1), completedMissionIds: [],
  directions: null, photo: null, npcActions: [], timer: null, capabilities: { coach: true, hints: true, freeze: false },
  validationMode: validation, inputPreference: 'voice', providerStatus: 'fixture',
});
const weights = { 'drink-vendor': 1, 'direction-helper': 1, 'hotel-landmark': 1, 'river-viewpoint': 1, 'photo-passerby': 1 };

/** A response tape for UI tests. It does not implement or certify the game engine, the city generator, or AI. */
export async function installScriptedApi(page: Page, options: { mission?: MissionId; validation?: boolean; steps?: Step[]; fixtures?: boolean } = {}) {
  let state = fixtureState(options.mission ?? 'Q1', options.validation ?? false);
  const steps = [...options.steps ?? []];
  const requests: { path: string; body: unknown }[] = [];
  const failures: string[] = [];
  let failure: { status: number; code: string; message: string; retryable: boolean } | null = null;
  const sent = new Map<string, unknown>();
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/health') return json(route, { status: 'ok', buildId: 'ui-fixture', specVersion: '2.0', providers: { geminiConfigured: false, elevenlabsConfigured: false }, features: { fixtures: options.fixtures ?? true, validationHarness: options.validation ?? false }, segments: { engine: 'implemented', dialogue: 'fixture', speech: 'unimplemented' } });
    const body: unknown = request.method() === 'POST' ? request.postDataJSON() : null;
    // City streaming is not under test here: answer with the shared seeded fallback, outside the request log.
    if (path.endsWith('/chunks')) {
      const input = ChunkRequestSchema.parse(body);
      try { return json(route, { chunks: input.coords.map((coord) => generateFallbackChunk(state.worldId, seedFromWorldId(state.worldId), coord, { missionId: state.missionId, weights })), pending: [] }); } catch { return json(route, { chunks: [], pending: input.coords }); }
    }
    if (path.endsWith('/chunks/restore')) { const input = ChunkRestoreRequestSchema.parse(body); return json(route, { accepted: [], rejected: [], chunks: input.chunks }); }
    requests.push({ path, body });
    if (failure) { const error = failure; failure = null; return json(route, { error: { code: error.code, message: error.message, retryable: error.retryable }, ...(error.status === 409 ? { state } : {}) }, error.status); }
    if (path === '/api/sessions') {
      const input = CreateSessionRequestSchema.parse(body);
      expect(input.validationMode).toBe(options.validation ?? false);
      state = PublicStateSchema.parse({ ...state, language: input.language, interactables: state.interactables.map((item) => ({ ...item, label: worldText(item.label, input.language) })), inputPreference: input.inputPreference, tier: input.initialTier, ...(input.worldId ? { worldId: input.worldId } : {}) });
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
      else if (input.action.type === 'move') patch = { position: input.action.position };
      else if (input.action.type === 'setInputPreference') patch = { inputPreference: input.action.preference };
      else if (['audioPhase', 'pausePractice', 'resumePractice'].includes(input.action.type)) patch = {};
      else { failures.push(`Unexpected action ${JSON.stringify(input.action)}`); return json(route, { error: { code: 'ACTION_FORBIDDEN', message: 'The quest prerequisites are not satisfied.', retryable: false } }, 422); }
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
      const response = TurnResponseSchema.parse({ turnId: input.turnId, state, events: [], npcReply: next?.reply ?? '好的。', actions: [...state.npcActions.filter((entry) => entry.anchorId === input.anchorId).map((entry) => entry.action), ...(next?.end ? [{ kind: 'end-conversation' as const }] : [])], ...(next?.end ? { conversationEnded: true } : {}), ...(next?.feedback ? { feedback: { understood: 'Your request was understood.', explanation: 'A short, clear Mandarin request works here.', improvedExample: '请给我一杯水，谢谢。' }, vibe: { intent: .9, clarity: .8, courtesy: .8 } } : {}) });
      sent.set(input.turnId, response);
      return json(route, response);
    }
    return json(route, { error: { code: 'NOT_IMPLEMENTED', message: 'Voice fixtures do not contact paid providers.', retryable: false } }, 501);
  });
  return { requests, failures, remaining: () => steps.length, state: () => state, failNext: (error: NonNullable<typeof failure>) => { failure = error; }, patch: (patch: Partial<PublicState>) => { state = PublicStateSchema.parse({ ...state, ...patch }); } };
}
