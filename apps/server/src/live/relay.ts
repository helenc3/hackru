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
  let closed = false;
  let waiters: ((text: string) => void)[] = [];
  const completeOutput = (text: string) => { lastOutput = text; outputText = ''; for (const waiter of waiters) waiter(text); waiters = []; };
  const nextOutput = () => new Promise<string | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), REPLY_WAIT_MS);
    waiters.push((text) => { clearTimeout(timer); resolve(text); });
  });

  function startTurn(afterModelTurn: boolean) {
    // ponytail: the input buffer resets here; a transcription fragment arriving after the turn starts becomes its own utterance.
    const text = inputText.trim().slice(0, 500); inputText = '';
    if (!text) return;
    options.send({ type: 'playerTranscript', text, final: true });
    const spokenReply = afterModelTurn ? () => Promise.resolve(lastOutput) : nextOutput;
    options.turn(text, spokenReply).then((turn) => {
      if (closed) return;
      options.send({ type: 'turn', turn });
      return Promise.resolve(options.note(turn)).then((note) => { if (note && !closed) options.live.sendNote(note); });
    }).catch((error: unknown) => {
      if (closed) return;
      const known = error instanceof EngineRuleError ? { code: error.code, message: error.message, retryable: false } : error instanceof HttpError ? { code: error.code, message: error.message, retryable: error.retryable } : { code: 'TURN_FAILED', message: 'The turn could not be evaluated.', retryable: true };
      options.send({ type: 'error', ...known });
    });
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
      if ((parsed as { type?: unknown } | null)?.type === 'stop') this.close('stop');
    },
    close(reason) {
      if (closed) return;
      closed = true;
      completeOutput('');
      options.send({ type: 'closed', reason });
      options.live.close();
    },
  };
}

function liveInstruction(context: TurnContext): string {
  return [
    `You are ${context.npcId}, an NPC in a Mandarin Chinese learning game, talking with a learner by voice. Persona: ${context.persona}`,
    'Speak only Simplified Chinese, standard Mandarin, as a real person would: at most two short sentences per reply, no English, no pinyin, no translations, no explanations, no coaching.',
    `Immutable facts, the only truth; never invent prices, platforms, times or destinations not listed: ${JSON.stringify(context.facts)}`,
    'Keep the conversation moving toward the mission goal. For the café: the customer names a drink, confirms its price, then pays. After greetings or unclear speech, ask what they would like.',
    'If the customer\'s Mandarin is understood but makes no sense for the situation, ask a short clarifying question in Mandarin that includes the key vocabulary they need, for example 您要茶还是水？ so every unclear answer still teaches the needed word.',
    'If the customer speaks English or another language, or their Mandarin is too unclear to understand, do NOT act on it: reply in simple Mandarin asking them to say it in Chinese and model the exact phrase for the current step, for example 请说中文。您可以说：我要一杯茶。 Never translate into English and never speak English yourself.',
    'Never announce objectives, rewards, XP or game results. Rudeness gets a firm, polite boundary, never abuse.',
    'Lines starting with [game] are system notes about the game state, not the customer speaking; follow them silently and never read them aloud. They tell you the next step and the target phrase to model.',
  ].join('\n');
}

/** Authored target phrase per café node; the voice NPC models it when the learner stalls or speaks English. */
export function targetPhrase(nodeId: string, drink: unknown): string | undefined {
  if (nodeId === 'p1.order') return '我要一杯茶';
  if (nodeId === 'p1.substitute') return '那就茶吧';
  if (nodeId === 'p1.receipt') return drink === 'water' ? '水五元' : '茶十元';
  return undefined;
}

export function alignmentNote(turn: TurnResponse, nodeId: string, drink: unknown): string {
  const next = turn.state.objectives.find((objective) => !objective.complete);
  const phrase = targetPhrase(nodeId, drink);
  return `[game] ${turn.events.length ? turn.events.map((event) => event.message).join(' ') : 'No progress this turn.'}${next ? ` Next step for the customer: ${next.label}` : ''}${phrase ? ` Target phrase the customer should say: ${phrase}` : ''}`;
}

/** WebSocket upgrade at /api/sessions/:id/live?npcId=… on the API server (the dev proxy forwards upgrades). */
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
    wss.handleUpgrade(request, socket, head, (ws) => void open(ws, decodeURIComponent(match[1]!), url.searchParams.get('npcId') ?? ''));
  });

  async function open(ws: WebSocket, sessionId: string, npcIdRaw: string): Promise<void> {
    const send = (event: ServerEvent) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event)); };
    const fail = (code: string, message: string) => { send({ type: 'error', code, message, retryable: false }); ws.close(4000, code); };
    const npcId = NpcIdSchema.safeParse(npcIdRaw);
    if (!npcId.success) return fail('INVALID_REQUEST', 'Unknown NPC.');
    const apiKey = services.config.geminiApiKey;
    if (!apiKey) return fail('LIVE_UNAVAILABLE', 'Live voice is not configured on this server.');
    let context: TurnContext;
    try {
      context = await store.withSession(sessionId, async (session) => {
        if (session.state.providerStatus !== 'live') throw new HttpError(422, 'LIVE_UNAVAILABLE', 'Live voice needs a live-provider session.');
        if (session.state.mode !== 'practice') throw new HttpError(422, 'LIVE_UNAVAILABLE', 'The boss uses the recorded conversation flow.');
        return dialogueContext(session.state, npcId.data);
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
        return runTurn(services, sessionId, { turnId: randomUUID(), expectedVersion: 0, npcId: npcId.data, input: { text, source: 'stt', transcriptionId } }, { checkVersion: false, spokenReply });
      },
      note: async (turn) => store.withSession(sessionId, async (session) => alignmentNote(turn, session.state.nodeId, session.state.flags['p1.drink'])),
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
    console.info(JSON.stringify({ live: 'open', npcId: npcId.data, model: services.config.geminiLiveModel }));
    send({ type: 'ready', npcId: npcId.data, sampleRate: 24000 });
  }
}
