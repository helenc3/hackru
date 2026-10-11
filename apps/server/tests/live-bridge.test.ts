import type { LiveServerMessage } from '@google/genai';
import type { TurnResponse } from '@vibequest/shared';
import { describe, expect, it } from 'vitest';
import { alignmentNote, createLiveBridge, type ServerEvent } from '../src/live/relay.js';

const message = (value: Record<string, unknown>) => value as unknown as LiveServerMessage;
const turnResponse = (events: { message: string }[]) => ({ turnId: 't', events, npcReply: 'x', state: { objectives: [{ id: 'a', label: 'Confirm the price.', complete: false }] } }) as unknown as TurnResponse;

describe('live bridge', () => {
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
