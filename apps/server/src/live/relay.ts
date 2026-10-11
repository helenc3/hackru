import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import { NpcIdSchema, EngineRuleError, dialogueContext, npcIdentity, pendingGoalAction, type NpcId, type TurnContext, type TurnResponse } from '@vibequest/shared';
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
/** Gemini's text is final at generationComplete (≈1.5 s), long before turnComplete (after its own audio length); late transcript pieces reset this grace. */
const TEXT_SETTLE_MS = 150;

/** Pure message bridge: Gemini Live frames in, protocol events out, one engine turn per finished utterance. */
export function createLiveBridge(options: {
  send: (event: ServerEvent) => void;
  live: LiveSink;
  turn: (text: string, spokenReply: () => Promise<string | undefined>) => Promise<TurnResponse>;
  note: (turn: TurnResponse) => Promise<string | undefined> | string | undefined;
  /** True when the turn leaves only a button to finish the task: the session ends like a goodbye. */
  ends?: (turn: TurnResponse) => boolean;
  /** Voices a line; stops sending when `signal` aborts and calls `onAudio` as each chunk goes out. */
  speak?: (text: string, signal: AbortSignal, onAudio: () => void) => Promise<void>;
  /**
   * Speculative speech: start voicing Gemini's reply text as soon as it is complete, while the engine
   * still evaluates the turn. The engine stays authoritative: if its committed line differs (the verified
   * hotel route, the authored line when the NPC leaves, any grounded override), unheard speculative audio
   * is cancelled, and heard audio finishes before the engine's line is spoken. Off for turns whose facts
   * cannot be spoken before evaluation (the Q2 guide's route); progress and buttons only ever come from the turn.
   */
  speculate?: boolean;
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

  // Utterances evaluate one at a time: a follow-up spoken while a turn is pending waits instead of hitting TURN_PENDING and vanishing.
  let turnTail: Promise<unknown> | undefined;
  function startTurn(afterModelTurn: boolean) {
    // ponytail: the input buffer resets here; a transcription fragment arriving after the turn starts becomes its own utterance.
    const text = inputText.trim().slice(0, 500); inputText = '';
    if (!text) return;
    const outputsBefore = outputs;
    options.send({ type: 'playerTranscript', text, final: true });
    // Listen for Gemini's reply now, not after evaluation: it usually finishes first, and a late listener waited out REPLY_WAIT_MS.
    const reply = afterModelTurn ? Promise.resolve(lastOutput) : nextOutput();
    const run = () => evaluateTurn(text, reply, afterModelTurn, outputsBefore);
    const chained = turnTail ? turnTail.then(run, run) : run(); // first turn starts now; later ones wait their turn
    turnTail = chained;
    void chained.then(() => { if (turnTail === chained) turnTail = undefined; });
  }

  function evaluateTurn(text: string, reply: Promise<string | undefined>, afterModelTurn: boolean, outputsBefore: number): Promise<unknown> {
    const startedMs = Date.now();
    const timing: Record<string, number> = {};
    const mark = (name: string) => { timing[name] ??= Date.now() - startedMs; };
    let settled = false;
    let early: { text: string; heard: boolean; abort: AbortController; done: Promise<boolean> } | undefined;
    const speak = (line: string, signal: AbortSignal, onHeard?: () => void) => options.speak!(line, signal, () => { mark('firstAudioMs'); onHeard?.(); }).then(() => true, () => false);
    void reply.then((spoken) => {
      mark('geminiTextMs');
      const line = spoken?.trim();
      if (!options.speak || !options.speculate || !line || closed || settled) return;
      const abort = new AbortController();
      const entry = { text: line, heard: false, abort, done: Promise.resolve(false) };
      entry.done = speak(line, abort.signal, () => { entry.heard = true; });
      early = entry;
    });
    return options.turn(text, () => reply).then(async (turn) => {
      settled = true; mark('evalMs');
      if (closed) return;
      if (options.speak) {
        const line = turn.npcReply.trim();
        const spokeIt = early && early.text === line ? await early.done : false;
        if (!spokeIt) {
          if (early?.heard) await early.done; else early?.abort.abort();
          const ok = await speak(line, new AbortController().signal);
          if (!ok && !closed) options.send({ type: 'error', code: 'SPEECH_UNAVAILABLE', message: 'Mandarin speech is temporarily unavailable.', retryable: true });
        }
      }
      console.info(JSON.stringify({ live: 'turn-timing', speculative: Boolean(early), ...timing }));
      if (closed) return;
      options.send({ type: 'turn', turn });
      if (turn.conversationEnded || options.ends?.(turn)) {
        // The spoken goodbye already completed while the engine evaluated: close now. Otherwise let it finish (next completed model turn), else cap.
        // A goodbye closes the panel; a finishing button ('goal') leaves it open on the button.
        const reason = turn.conversationEnded ? 'farewell' : 'goal';
        if (options.speak || afterModelTurn || outputs > outputsBefore) { close(reason); return; } // with speak, the line already played
        const timer = setTimeout(() => close(reason), FAREWELL_WAIT_MS);
        waiters.push(() => { clearTimeout(timer); close(reason); });
        return;
      }
      return Promise.resolve(options.note(turn)).then((note) => { if (note && !closed) options.live.sendNote(note); });
    }).catch((error: unknown) => {
      early?.abort.abort(); // a rejected turn never gets its speculative line
      if (closed) return;
      const known = error instanceof EngineRuleError ? { code: error.code, message: error.message, retryable: false } : error instanceof HttpError ? { code: error.code, message: error.message, retryable: error.retryable } : { code: 'TURN_FAILED', message: 'The turn could not be evaluated.', retryable: true };
      options.send({ type: 'error', ...known });
    });
  }

  // The reply text is complete once per model turn: early at generationComplete (+grace), else at turnComplete.
  let textDone = false;
  let settle: ReturnType<typeof setTimeout> | undefined;
  function finishText() {
    clearTimeout(settle); settle = undefined;
    if (textDone || closed) return;
    textDone = true;
    if (outputText.trim()) options.send({ type: 'npcTranscript', text: outputText, final: true });
    completeOutput(outputText);
  }

  function close(reason: string) {
    if (closed) return;
    closed = true;
    clearTimeout(settle);
    completeOutput('');
    options.send({ type: 'closed', reason });
    options.live.close();
  }

  return {
    onLiveMessage(message) {
      if (closed) return;
      const content = message.serverContent;
      // gemini-3.8-live never flags `finished`; the model answering means the utterance ended, so evaluate now instead of after its reply.
      if (message.data) { if (!options.speak) options.send({ type: 'audio', data: message.data }); startTurn(false); }
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
        if (settle) { clearTimeout(settle); settle = setTimeout(finishText, TEXT_SETTLE_MS); }
      }
      if (content.generationComplete && !textDone && !settle) settle = setTimeout(finishText, TEXT_SETTLE_MS);
      if (content.turnComplete) {
        finishText();
        textDone = false;
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

/** What each person knows and does in their own world; the engine, not this text, decides progress. */
const ROLE_GOALS: Record<NpcId, string> = {
  vendor: 'You run a small drink stall. You have tea and water; coffee is sold out today. When someone wants a drink, tell them what you have and the price. Payment happens at your counter, so once the price is clear you just wait for them to pay.',
  guide: 'You are a local who knows these streets. If someone asks how to get to 上海大酒店, give the hotelRoute fact word for word. If there is no hotelRoute fact, or they ask about another place, say you are not sure. Never invent roads, turns or distances.',
  passerby: 'You are strolling by the Huangpu River. If someone asks you to take their photo, agree and tell them to stand where the river is behind them; you count down once they are in place. Do not say the photo was taken until it is.',
};

function liveInstruction(context: TurnContext): string {
  return [
    `You are ${context.nameZh}, an ordinary person in a Shanghai neighbourhood, talking with someone who has just come up to you. ${context.persona}`,
    'You know nothing about games, lessons, learners, quests or buttons, and you never teach: no model sentences, no "你可以说…", no "请说中文", no English, no pinyin, no translations, no explanations.',
    'Speak only Simplified Chinese, standard Mandarin, casually and naturally: at most two short sentences per reply (a route you were given may be longer). Answer what was said and ask a natural follow-up when it fits.',
    `Immutable facts, the only truth; never invent prices, roads, landmarks or places not listed: ${JSON.stringify(context.facts)}`,
    ROLE_GOALS[context.npcId],
    'You like a chat and are in no hurry. Mention something else you have or know when it fits (only from the facts: otherWares, smallTalk — other wares are not for sale right now), and ask one friendly personal question per reply (where they are from, first time in Shanghai, what they have seen). Never claim something happened that has not (a photo taken, money paid).',
    'The first time someone asks you for something (a drink, the way, a photo) before you have chatted at all, answer with a friendly question first and help once they reply or ask again.',
    'If you did not catch what they meant, react like a real person (啊？什么？ / 你是说茶吗？). If they speak English or another language, you do not really understand it: show brief, natural confusion in Mandarin and do not act on it.',
    'Rudeness gets a firm, polite boundary, never abuse.',
    'Lines starting with [context] describe what just happened around you, not something the other person said; take them into account silently and never read them aloud.',
  ].join('\n');
}

/** In-world context after a committed turn; the verified route must be spoken exactly, since the model may have improvised. */
export function alignmentNote(turn: TurnResponse): string | undefined {
  if (turn.events.some((event) => event.kind === 'directions') && turn.state.directions) return `[context] Tell them this route word for word, adding nothing: ${turn.state.directions.textZh}`;
  if (turn.state.photo?.status === 'accepted') return '[context] You agreed to take their photo. Tell them to stand where the river is behind them; you count down once they are ready.';
  // The engine's patience count: near its limit the NPC shows it (the engine ends the attempt at the limit).
  if (turn.state.status === 'active' && Object.values(turn.state.npcMood).includes('terse')) return '[context] You have been chatting a long time and have things to do. Show some impatience and say you need to get going soon.';
  return undefined;
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
    let speechEpoch = 0;
    const send = (event: ServerEvent) => {
      if (event.type === 'interrupted') speechEpoch++;
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
    };
    const fail = (code: string, message: string) => { send({ type: 'error', code, message, retryable: false }); ws.close(4000, code); };
    const npcId = NpcIdSchema.safeParse(npcIdRaw);
    if (!npcId.success) return fail('INVALID_REQUEST', 'Unknown NPC.');
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(anchorIdRaw)) return fail('INVALID_REQUEST', 'Unknown NPC anchor.');
    const anchorId = anchorIdRaw;
    const apiKey = services.config.geminiApiKey;
    if (!apiKey) return fail('LIVE_UNAVAILABLE', 'Live voice is not configured on this server.');
    let context: TurnContext;
    let voiceKey: string = npcId.data;
    try {
      context = await store.withSession(sessionId, async (session) => {
        if (session.state.providerStatus !== 'live') throw new HttpError(422, 'LIVE_UNAVAILABLE', 'Live voice needs a live-provider session.');
        const world = services.worlds.view(session.state.worldId);
        const nameKey = world.anchor(anchorId)?.nameKey;
        if (npcIdentity(nameKey)) voiceKey = `npc:${nameKey}`;
        return dialogueContext(session.state, npcId.data, anchorId, world);
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
    const provider = services.speechProvider;
    const bridge = createLiveBridge({
      send,
      ends: (turn) => Boolean(pendingGoalAction(turn.state.npcActions, turn.state.inventory.cny, npcId.data)),
      speculate: !(npcId.data === 'guide' && context.missionId === 'Q2'), // the route is only known after evaluation
      // Without a speech provider the bridge forwards Gemini's own audio instead of going silent.
      speak: !(provider.streamPcm || provider.synthesizePcm) ? undefined : async (text, signal, onAudio) => {
        const epoch = speechEpoch;
        // Stream when the provider can, so the first words play while the rest is still being generated.
        const chunks = provider.streamPcm ? provider.streamPcm(text, voiceKey) : (async function* () {
          if (!provider.synthesizePcm) throw new HttpError(503, 'SPEECH_UNAVAILABLE', 'Mandarin speech is temporarily unavailable.', true);
          yield await provider.synthesizePcm(text, voiceKey);
        })();
        for await (const audio of chunks) {
          if (torn || signal.aborted || epoch !== speechEpoch) return; // leaving the loop cancels the provider stream
          for (let offset = 0; offset < audio.length; offset += 16_384) {
            send({ type: 'audio', data: Buffer.from(audio.subarray(offset, offset + 16_384)).toString('base64') });
          }
          onAudio();
        }
      },
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
      note: (turn) => alignmentNote(turn),
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
