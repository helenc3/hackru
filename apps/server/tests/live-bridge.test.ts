import type { LiveServerMessage } from '@google/genai';
import type { TurnResponse } from '@vibequest/shared';
import { describe, expect, it } from 'vitest';
import { alignmentNote, createLiveBridge, targetPhrase, type ServerEvent } from '../src/live/relay.js';

const message = (value: Record<string, unknown>) => value as unknown as LiveServerMessage;
const turnResponse = (events: { message: string }[]) => ({ turnId: 't', events, npcReply: 'x', state: { objectives: [{ id: 'a', label: 'Confirm the price.', complete: false }] } }) as unknown as TurnResponse;

describe('live bridge', () => {
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
});

describe('live alignment notes', () => {
  const turn = (events: { kind: string; message: string }[], directions: { textZh: string } | null) =>
    ({ events, state: { objectives: [{ id: 'q2.ask', label: 'Ask the way to the hotel.', complete: false }], directions } }) as unknown as TurnResponse;
  it('makes the NPC speak a verified route word for word', () => {
    const note = alignmentNote(turn([{ kind: 'directions', message: 'Route verified.' }], { textZh: '沿着南京路往东走。' }), 'guide', 'q2.ask', undefined);
    expect(note).toBe('[game] Say this verified route to the learner word for word, adding nothing: 沿着南京路往东走。');
  });
  it('otherwise models the role phrase and the next step', () => {
    expect(alignmentNote(turn([], null), 'passerby', 'q3.ask', undefined)).toContain('可以帮我在这里拍张照吗？');
    expect(targetPhrase('vendor', 'q1.receipt', 'water')).toBe('水五元');
    expect(targetPhrase('vendor', 'q1.order')).toBe('我要一杯茶');
  });
});
