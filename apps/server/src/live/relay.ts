import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import { NpcIdSchema, EngineRuleError, dialogueContext, type NpcId, type TurnContext, type TurnResponse } from '@vibequest/shared';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { HttpError } from '../errors.js';
import { TRANSCRIPTION_TTL_MS } from '../routes/audio.js';
import { runTurn } from '../routes/game.js';
import type { ServerServices } from '../services.js';
import { registerTranscription } from '../session-store.js';

/** Relay protocol (frozen with the web client). Audio is PCM16LE mono: 16 kHz in, 24 kHz out. */
export type ServerEvent =
  | { type: 'ready'; npcId: NpcId; sampleRate: 24000 }
  | { type: 'audio'; data: string }
  | { type: 'playerTranscript'; text: string; final: boolean }
  | { type: 'npcTranscript'; text: string; final: boolean }
  | { type: 'interrupted' }
  | { type: 'turn'; turn: TurnResponse }
  | { type: 'error'; code: string; message: string; retryable: boolean }
  | { type: 'closed'; reason: string };

export interface LiveSink { sendAudio(base64: string): void; sendNote(text: string): void; close(): void }
export interface Bridge { onLiveMessage(message: LiveServerMessage): void; onClientAudio(chunk: Buffer): void; onClientText(raw: string): void; close(reason: string): void }

const MAX_SESSION_MS = 10 * 60_000;
const REPLY_WAIT_MS = 8_000;
const FAREWELL_WAIT_MS = 4_000;

/** Pure message bridge: Gemini Live frames in, protocol events out, one engine turn per finished utterance. */
export function createLiveBridge(options: {
  send: (event: ServerEvent) => void;
  live: LiveSink;
  turn: (text: string, spokenReply: () => Promise<string | undefined>) => Promise<TurnResponse>;
  note: (turn: TurnResponse) => Promise<string | undefined> | string | undefined;
}): Bridge {
  let inputText = '';
  let outputText = '';
  let lastOutput = '';
  let outputs = 0;
  let closed = false;
  let waiters: ((text: string) => void)[] = [];
  const completeOutput = (text: string) => { lastOutput = text; outputText = ''; outputs++; for (const waiter of waiters) waiter(text); waiters = []; };
  const nextOutput = () => new Promise<string | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), REPLY_WAIT_MS);
    waiters.push((text) => { clearTimeout(timer); resolve(text); });
  });

  function startTurn(afterModelTurn: boolean) {
    // ponytail: the input buffer resets here; a transcription fragment arriving after the turn starts becomes its own utterance.
    const text = inputText.trim().slice(0, 500); inputText = '';
    if (!text) return;
    const outputsBefore = outputs;
    options.send({ type: 'playerTranscript', text, final: true });
    const spokenReply = afterModelTurn ? () => Promise.resolve(lastOutput) : nextOutput;
    options.turn(text, spokenReply).then((turn) => {
      if (closed) return;
      options.send({ type: 'turn', turn });
      if (turn.conversationEnded) {
        // The spoken goodbye already completed while the engine evaluated: close now. Otherwise let it finish (next completed model turn), else cap.
        if (afterModelTurn || outputs > outputsBefore) { close('farewell'); return; }
        const timer = setTimeout(() => close('farewell'), FAREWELL_WAIT_MS);
        waiters.push(() => { clearTimeout(timer); close('farewell'); });
        return;
      }
      return Promise.resolve(options.note(turn)).then((note) => { if (note && !closed) options.live.sendNote(note); });
    }).catch((error: unknown) => {
      if (closed) return;
      const known = error instanceof EngineRuleError ? { code: error.code, message: error.message, retryable: false } : error instanceof HttpError ? { code: error.code, message: error.message, retryable: error.retryable } : { code: 'TURN_FAILED', message: 'The turn could not be evaluated.', retryable: true };
      options.send({ type: 'error', ...known });
    });
  }

  function close(reason: string) {
    if (closed) return;
    closed = true;
    completeOutput('');
    options.send({ type: 'closed', reason });
    options.live.close();
  }

  return {
    onLiveMessage(message) {
      if (closed) return;
      const content = message.serverContent;
      // gemini-3.8-live never flags `finished`; the model answering means the utterance ended, so evaluate now instead of after its reply.
      if (message.data) { options.send({ type: 'audio', data: message.data }); startTurn(false); }
      if (!content) return;
      if (content.interrupted) { options.send({ type: 'interrupted' }); completeOutput(outputText); }
      if (content.inputTranscription?.text) {
        inputText += content.inputTranscription.text;
        options.send({ type: 'playerTranscript', text: inputText, final: false });
        if (content.inputTranscription.finished) startTurn(false);
      }
      if (content.outputTranscription?.text) {
        startTurn(false);
        outputText += content.outputTranscription.text;
        options.send({ type: 'npcTranscript', text: outputText, final: false });
      }
      if (content.turnComplete) {
        if (outputText.trim()) options.send({ type: 'npcTranscript', text: outputText, final: true });
        completeOutput(outputText);
        startTurn(true); // Models that never flag `finished` still get one turn per exchange.
      }
    },
    onClientAudio(chunk) { if (!closed && chunk.length) options.live.sendAudio(chunk.toString('base64')); },
    onClientText(raw) {
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return; }
      if ((parsed as { type?: unknown } | null)?.type === 'stop') close('stop');
    },
    close,
  };
}

/** What each role steers toward; the engine, not this text, decides progress. */
const ROLE_GOALS: Record<NpcId, string> = {
  vendor: 'You sell drinks. Goal: the customer names a drink, confirms its price, then pays. Coffee is sold out; offer tea or water. After greetings or unclear speech, ask what they would like to drink.',
  guide: 'You are a local who knows the way. If asked how to reach 上海大酒店, say the hotelRoute fact word for word. If there is no hotelRoute fact, or they ask about another place, say you are not sure of the way. Never invent roads, turns or distances.',
  passerby: 'You are a friendly passer-by by the Huangpu River. If the learner asks you to take their photo, agree and ask them to stand at the photo spot with the river behind them; the game runs the countdown. Do not claim the photo was taken.',
};

function liveInstruction(context: TurnContext): string {
  return [
    `You are ${context.nameZh}, an NPC in a Mandarin Chinese learning game set in a Shanghai neighbourhood, talking with a learner by voice. Persona: ${context.persona}`,
    'Speak only Simplified Chinese, standard Mandarin, as a real person would: at most two short sentences per reply (a verified route may be longer), no English, no pinyin, no translations, no explanations, no coaching.',
    `Immutable facts, the only truth; never invent prices, roads, landmarks or places not listed: ${JSON.stringify(context.facts)}`,
    ROLE_GOALS[context.npcId],
    'If the learner\'s Mandarin is understood but makes no sense for the situation, ask a short clarifying question in Mandarin that includes the key vocabulary they need, so every unclear answer still teaches the needed word.',
    `If the learner speaks English or another language, or their Mandarin is too unclear to understand, do NOT act on it: reply in simple Mandarin asking them to say it in Chinese and model the exact phrase for the current step, for example 请说中文。您可以说：${targetPhrase(context.npcId, undefined)} Never translate into English and never speak English yourself.`,
    'Never announce objectives, rewards, XP or game results. Rudeness gets a firm, polite boundary, never abuse.',
    'Lines starting with [game] are system notes about the game state, not the customer speaking; follow them silently and never read them aloud. They tell you the next step and the target phrase to model.',
  ].join('\n');
}

/** Authored target phrase per role (and café step); the voice NPC models it when the learner stalls or speaks English. */
export function targetPhrase(npcId: NpcId, nodeId: string | undefined, drink?: unknown): string {
  if (npcId === 'guide') return '请问，去上海大酒店怎么走？';
  if (npcId === 'passerby') return '可以帮我在这里拍张照吗？';
  if (nodeId?.endsWith('.substitute')) return '那就茶吧';
  if (nodeId?.endsWith('.receipt')) return drink === 'water' ? '水五元' : '茶十元';
  return '我要一杯茶';
}

export function alignmentNote(turn: TurnResponse, npcId: NpcId, nodeId: string, drink: unknown): string {
  // A verified route must be spoken exactly; the model's earlier reply may have improvised.
  if (turn.events.some((event) => event.kind === 'directions') && turn.state.directions) return `[game] Say this verified route to the learner word for word, adding nothing: ${turn.state.directions.textZh}`;
  const next = turn.state.objectives.find((objective) => !objective.complete);
  return `[game] ${turn.events.length ? turn.events.map((event) => event.message).join(' ') : 'No progress this turn.'}${next ? ` Next step for the learner: ${next.label}` : ''} Target phrase the learner should say: ${targetPhrase(npcId, nodeId, drink)}`;
}

/** WebSocket upgrade at /api/sessions/:id/live?npcId=…&anchorId=… on the API server (the dev proxy forwards upgrades). */
export type LiveSession = Pick<Session, 'sendRealtimeInput' | 'sendClientContent' | 'close'>;
export type LiveConnect = (params: Parameters<GoogleGenAI['live']['connect']>[0]) => Promise<LiveSession>;

export function attachLiveRelay(server: Server, services: ServerServices, options: { connect?: LiveConnect } = {}): void {
  const wss = new WebSocketServer({ noServer: true });
  const active = new Map<string, () => void>();
  const store = services.sessionStore;
  const connect: LiveConnect = options.connect ?? ((params) => new GoogleGenAI({ apiKey: services.config.geminiApiKey! }).live.connect(params));

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const match = /^\/api\/sessions\/([^/]+)\/live$/.exec(url.pathname);
    if (!match) { socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, (ws) => void open(ws, decodeURIComponent(match[1]!), url.searchParams.get('npcId') ?? '', url.searchParams.get('anchorId') ?? ''));
  });

  async function open(ws: WebSocket, sessionId: string, npcIdRaw: string, anchorIdRaw: string): Promise<void> {
    const send = (event: ServerEvent) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event)); };
    const fail = (code: string, message: string) => { send({ type: 'error', code, message, retryable: false }); ws.close(4000, code); };
    const npcId = NpcIdSchema.safeParse(npcIdRaw);
    if (!npcId.success) return fail('INVALID_REQUEST', 'Unknown NPC.');
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(anchorIdRaw)) return fail('INVALID_REQUEST', 'Unknown NPC anchor.');
    const anchorId = anchorIdRaw;
    const apiKey = services.config.geminiApiKey;
    if (!apiKey) return fail('LIVE_UNAVAILABLE', 'Live voice is not configured on this server.');
    let context: TurnContext;
    try {
      context = await store.withSession(sessionId, async (session) => {
        if (session.state.providerStatus !== 'live') throw new HttpError(422, 'LIVE_UNAVAILABLE', 'Live voice needs a live-provider session.');
        return dialogueContext(session.state, npcId.data, anchorId, services.worlds.view(session.state.worldId));
      });
    } catch (error) {
      return fail(error instanceof HttpError || error instanceof EngineRuleError ? error.code : 'LIVE_UNAVAILABLE', error instanceof Error ? error.message : 'Live voice is unavailable.');
    }
    active.get(sessionId)?.(); // one live conversation per game session: the previous Gemini session closes now

    let gemini: LiveSession | undefined;
    let torn = false;
    const abort = new AbortController();
    const timer = setTimeout(() => bridge.close('time-limit'), MAX_SESSION_MS); // cap counts from the upgrade
    const release = () => { if (active.get(sessionId) === release) active.delete(sessionId); bridge.close('replaced'); };
    const bridge = createLiveBridge({
      send,
      live: {
        sendAudio: (data) => gemini?.sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } }),
        sendNote: (text) => gemini?.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: false }),
        close: () => {
          torn = true; abort.abort(); clearTimeout(timer);
          try { gemini?.close(); } catch { /* already closed */ }
          gemini = undefined;
          if (active.get(sessionId) === release) active.delete(sessionId); // never touch a newer connection's entry
          ws.close(1000, 'closed');
        },
      },
      turn: async (text, spokenReply) => {
        const nowMs = Date.now();
        const transcriptionId = randomUUID();
        await store.withSession(sessionId, async (session) => {
          const record = { id: transcriptionId, sessionId, attemptId: session.state.attemptId, originalText: text, createdAtMs: nowMs, expiresAtMs: nowMs + TRANSCRIPTION_TTL_MS };
          if (!registerTranscription(session, record, nowMs)) throw new HttpError(409, 'ATTEMPT_ABANDONED', 'The mission was retried.', true);
        });
        return runTurn(services, sessionId, { turnId: randomUUID(), expectedVersion: 0, npcId: npcId.data, anchorId, input: { text, source: 'stt', transcriptionId } }, { checkVersion: false, spokenReply });
      },
      note: async (turn) => store.withSession(sessionId, async (session) => alignmentNote(turn, npcId.data, session.state.nodeId, session.state.flags['q1.drink'])),
    });
    active.set(sessionId, release);
    ws.on('message', (data, isBinary) => { if (isBinary) bridge.onClientAudio(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)); else bridge.onClientText(data.toString()); });
    ws.on('close', () => bridge.close('client-closed'));
    ws.on('error', () => bridge.close('client-error'));

    let session: LiveSession;
    try {
      session = await connect({
        model: services.config.geminiLiveModel,
        config: {
          abortSignal: abort.signal,
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: liveInstruction(context),
        },
        callbacks: {
          onmessage: (message) => bridge.onLiveMessage(message),
          onerror: () => { send({ type: 'error', code: 'PROVIDER_UNAVAILABLE', message: 'The live voice service failed.', retryable: true }); bridge.close('provider-error'); },
          onclose: () => bridge.close('provider-closed'),
        },
      });
    } catch {
      if (torn) return; // the client left during connect; nothing to report
      send({ type: 'error', code: 'PROVIDER_UNAVAILABLE', message: 'The live voice service could not be reached.', retryable: true });
      bridge.close('provider-unavailable');
      return;
    }
    if (torn) { try { session.close(); } catch { /* closed */ } return; } // client left while Gemini was connecting
    gemini = session;
    console.info(JSON.stringify({ live: 'open', npcId: npcId.data, anchorId, model: services.config.geminiLiveModel }));
    send({ type: 'ready', npcId: npcId.data, sampleRate: 24000 });
  }
}
