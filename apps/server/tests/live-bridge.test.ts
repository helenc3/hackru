import type { LiveServerMessage } from '@google/genai';
import type { TurnResponse } from '@vibequest/shared';
import { describe, expect, it } from 'vitest';
import { alignmentNote, createLiveBridge, type ServerEvent } from '../src/live/relay.js';

const message = (value: Record<string, unknown>) => value as unknown as LiveServerMessage;
const turnResponse = (events: { message: string }[]) => ({ turnId: 't', events, npcReply: 'x', state: { objectives: [{ id: 'a', label: 'Confirm the price.', complete: false }] } }) as unknown as TurnResponse;

describe('live bridge', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const live = { sendAudio: () => undefined, sendNote: () => undefined, close: () => undefined };
  const reply = (text: string) => [message({ data: 'X', serverContent: { outputTranscription: { text } } }), message({ serverContent: { turnComplete: true } })];

  it('hears Gemini\'s reply even when it finishes before the evaluation (no REPLY_WAIT timeout)', async () => {
    let evaluated!: () => void;
    const seen: (string | undefined)[] = [];
    const bridge = createLiveBridge({ send: () => undefined, live, note: () => undefined,
      turn: async (_, spoken) => { await new Promise<void>((resolve) => { evaluated = resolve; }); seen.push(await Promise.race([spoken(), new Promise<string>((resolve) => setTimeout(() => resolve('timed out'), 50))])); return turnResponse([]); } });
    bridge.onLiveMessage(message({ serverContent: { inputTranscription: { text: '你好' } } }));
    for (const m of reply('你好啊！')) bridge.onLiveMessage(m);
    await tick(); evaluated(); await new Promise((resolve) => setTimeout(resolve, 80));
    expect(seen).toEqual(['你好啊！']);
  });

  it('treats the reply text as final at generationComplete, without waiting for turnComplete', async () => {
    const replies: (string | undefined)[] = [];
    const bridge = createLiveBridge({ send: () => undefined, live, note: () => undefined, turn: async (_, spoken) => { replies.push(await spoken()); return turnResponse([]); } });
    bridge.onLiveMessage(message({ serverContent: { inputTranscription: { text: '你好' } } }));
    bridge.onLiveMessage(message({ data: 'X', serverContent: { outputTranscription: { text: '你好啊，' } } }));
    bridge.onLiveMessage(message({ serverContent: { generationComplete: true } }));
    bridge.onLiveMessage(message({ serverContent: { outputTranscription: { text: '要喝点什么？' } } })); // a late piece resets the grace
    await new Promise((resolve) => setTimeout(resolve, 400)); // no turnComplete yet: Gemini is still "playing" its suppressed audio
    expect(replies).toEqual(['你好啊，要喝点什么？']);
  });

  it('speaks Gemini\'s finished text before the engine commits, once, when the engine keeps it', async () => {
    const spoken: string[] = []; const events: ServerEvent[] = [];
    let commit!: () => void;
    const bridge = createLiveBridge({ send: (event) => events.push(event), live, note: () => undefined, speculate: true,
      speak: async (text, _signal, onAudio) => { spoken.push(text); onAudio(); },
      turn: async (_, spokenText) => { const text = await spokenText(); await new Promise<void>((resolve) => { commit = resolve; }); return { ...turnResponse([]), npcReply: text! }; } });
    bridge.onLiveMessage(message({ serverContent: { inputTranscription: { text: '我要水' } } }));
    for (const m of reply('好嘞，水五块。')) bridge.onLiveMessage(m);
    await tick();
    expect(spoken).toEqual(['好嘞，水五块。']); // already speaking while the engine evaluates
    expect(events.some((event) => event.type === 'turn')).toBe(false);
    commit(); await tick(); await tick();
    expect(spoken).toEqual(['好嘞，水五块。']);
    expect(events.at(-1)?.type).toBe('turn');
  });

  it('the engine stays authoritative: unheard speculation is cancelled, heard speculation finishes first', async () => {
    for (const heard of [false, true]) {
      const spoken: string[] = []; const aborted: string[] = [];
      const bridge = createLiveBridge({ send: () => undefined, live, note: () => undefined, speculate: true,
        speak: async (text, signal, onAudio) => { spoken.push(text); if (heard || text === '算了，我忙着呢。') onAudio(); await new Promise((resolve) => setTimeout(resolve, 5)); if (signal.aborted) aborted.push(text); },
        turn: async (_, spokenText) => { await spokenText(); await tick(); return { ...turnResponse([]), npcReply: '算了，我忙着呢。' }; } });
      bridge.onLiveMessage(message({ serverContent: { inputTranscription: { text: '今天天气不错' } } }));
      for (const m of reply('是啊，天气真好！')) bridge.onLiveMessage(m);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(spoken).toEqual(['是啊，天气真好！', '算了，我忙着呢。']);
      expect(aborted).toEqual(heard ? [] : ['是啊，天气真好！']);
    }
  });

  it('uses character speech instead of the model audio and waits before closing a farewell', async () => {
    const events: ServerEvent[] = [];
    let finishSpeech!: () => void;
    const spoken: string[] = [];
    const bridge = createLiveBridge({
      send: (event) => events.push(event),
      live: { sendAudio: () => undefined, sendNote: () => undefined, close: () => undefined },
      turn: async (_, reply) => { await reply(); return { ...turnResponse([]), npcReply: '再见！', conversationEnded: true }; },
      note: () => undefined,
      speak: (text) => { spoken.push(text); return new Promise<void>((resolve) => { finishSpeech = resolve; }); },
    });
    bridge.onLiveMessage(message({ serverContent: { inputTranscription: { text: '再见', finished: true } } }));
    bridge.onLiveMessage(message({ data: 'MODEL_AUDIO', serverContent: { outputTranscription: { text: '再见！' }, turnComplete: true } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spoken).toEqual(['再见！']);
    expect(events.some((event) => event.type === 'audio' || event.type === 'closed')).toBe(false);
    finishSpeech();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events.at(-1)).toEqual({ type: 'closed', reason: 'farewell' });
  });

  it('relays audio, runs one engine turn per finished utterance, and feeds the spoken reply back', async () => {
    const events: ServerEvent[] = [];
    const live = { audio: [] as string[], notes: [] as string[], closed: false, sendAudio: (d: string) => { live.audio.push(d); }, sendNote: (t: string) => { live.notes.push(t); }, close: () => { live.closed = true; } };
    const turns: { text: string; reply: string | undefined }[] = [];
    const bridge = createLiveBridge({
      send: (event) => events.push(event), live,
      turn: async (text, spokenReply) => { turns.push({ text, reply: await spokenReply() }); return turnResponse([{ message: 'The customer ordered tea.' }]); },
      note: (turn) => `[game] ${turn.events[0]?.message}`,
    });
    bridge.onClientAudio(Buffer.from([1, 2, 3]));
    expect(live.audio).toEqual([Buffer.from([1, 2, 3]).toString('base64')]);
    bridge.onLiveMessage(message({ serverContent: { inputTranscription: { text: '我要' } } }));
    bridge.onLiveMessage(message({ serverContent: { inputTranscription: { text: '一杯茶', finished: true } } }));
    bridge.onLiveMessage(message({ data: 'QUJD', serverContent: { outputTranscription: { text: '好的，' } } }));
    bridge.onLiveMessage(message({ serverContent: { outputTranscription: { text: '一杯茶十元。' }, turnComplete: true } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(turns).toEqual([{ text: '我要一杯茶', reply: '好的，一杯茶十元。' }]);
    expect(events.map((event) => event.type)).toEqual(['playerTranscript', 'playerTranscript', 'playerTranscript', 'audio', 'npcTranscript', 'npcTranscript', 'npcTranscript', 'turn']);
    expect(events.find((event) => event.type === 'playerTranscript' && event.final)).toMatchObject({ text: '我要一杯茶' });
    expect(live.notes).toEqual(['[game] The customer ordered tea.']);
  });

  it('falls back to one turn per model turn when the transcript never flags finished, reports interruptions, and stops', async () => {
    const events: ServerEvent[] = [];
    const live = { closed: false, sendAudio: () => undefined, sendNote: () => undefined, close: () => { live.closed = true; } };
    const turns: string[] = [];
    const bridge = createLiveBridge({ send: (event) => events.push(event), live, turn: async (text) => { turns.push(text); return turnResponse([]); }, note: () => undefined });
    bridge.onLiveMessage(message({ serverContent: { inputTranscription: { text: '你好' } } }));
    bridge.onLiveMessage(message({ serverContent: { interrupted: true } }));
    bridge.onLiveMessage(message({ serverContent: { turnComplete: true } }));
    bridge.onLiveMessage(message({ serverContent: { inputTranscription: { text: '我要茶' } } }));
    bridge.onLiveMessage(message({ data: 'QUJD' })); // model starts answering: utterance ended
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(turns).toEqual(['你好', '我要茶']);
    expect(events.some((event) => event.type === 'interrupted')).toBe(true);
    bridge.onClientText('{"type":"stop"}');
    expect(live.closed).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'closed', reason: 'stop' });
    bridge.onLiveMessage(message({ data: 'QUJD' }));
    expect(events.at(-1)).toEqual({ type: 'closed', reason: 'stop' });
  });

  it('closes right after a goodbye that finished speaking before the engine answered', async () => {
    const events: ServerEvent[] = [];
    const live = { closed: false, sendAudio: () => undefined, sendNote: () => undefined, close: () => { live.closed = true; } };
    let resolveTurn: (turn: TurnResponse) => void = () => undefined;
    const bridge = createLiveBridge({ send: (event) => events.push(event), live, turn: () => new Promise<TurnResponse>((resolve) => { resolveTurn = resolve; }), note: () => undefined });
    bridge.onLiveMessage(message({ serverContent: { inputTranscription: { text: '再见' } } }));
    bridge.onLiveMessage(message({ data: 'QUJD', serverContent: { outputTranscription: { text: '再见！' } } })); // turn starts on the first audio frame
    bridge.onLiveMessage(message({ serverContent: { turnComplete: true } })); // goodbye finished before the engine answered
    expect(live.closed).toBe(false);
    resolveTurn({ ...turnResponse([]), conversationEnded: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(live.closed).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'closed', reason: 'farewell' });
    expect(events.filter((event) => event.type === 'turn')).toHaveLength(1);
  });
  it('ends the session (reason goal) when a turn leaves only a finishing button', async () => {
    const events: ServerEvent[] = [];
    const live = { closed: false, sendAudio: () => undefined, sendNote: () => undefined, close: () => { live.closed = true; } };
    const bridge = createLiveBridge({ send: (event) => events.push(event), live, turn: async () => turnResponse([]), note: () => undefined, ends: () => true });
    bridge.onLiveMessage(message({ serverContent: { inputTranscription: { text: '我要水' } } }));
    bridge.onLiveMessage(message({ data: 'QUJD', serverContent: { outputTranscription: { text: '好嘞，水五块。' } } }));
    bridge.onLiveMessage(message({ serverContent: { turnComplete: true } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(live.closed).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'closed', reason: 'goal' });
  });
});

describe('live alignment notes', () => {
  const turn = (events: { kind: string; message: string }[], directions: { textZh: string } | null, photo: { status: string } | null = null) =>
    ({ events, state: { objectives: [{ id: 'q2.ask', label: 'Ask the way to the hotel.', complete: false }], directions, photo } }) as unknown as TurnResponse;
  it('makes the NPC speak a verified route word for word', () => {
    expect(alignmentNote(turn([{ kind: 'directions', message: 'Route verified.' }], { textZh: '沿着南京路往东走。' }))).toBe('[context] Tell them this route word for word, adding nothing: 沿着南京路往东走。');
  });
  it('gives in-world context only, never a phrase for the player to say', () => {
    expect(alignmentNote(turn([], null, { status: 'accepted' }))).toContain('photo');
    expect(alignmentNote(turn([], null))).toBeUndefined();
  });
});
