import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express, { type ErrorRequestHandler } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import { AnnotateResponseSchema, LookupResponseSchema } from '@vibequest/shared';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { markSyllable } from '../../src/dictionary/dictionary.js';
import { createDictionaryRouter } from '../../src/dictionary/router.js';
import type { ClaudeClient } from '../../src/providers/claude/live.js';

const config = loadConfig({ NODE_ENV: 'test' });
const app = createApp({ config });
const lookup = async (q: string, status = 200) => (await request(app).get('/api/dictionary/lookup').query({ q }).expect(status)).body;
const first = async (q: string) => LookupResponseSchema.parse(await lookup(q)).entries[0];

describe('dictionary lookup', () => {
  it('finds single words by Hanzi, pinyin (marked, numbered, bare) and English', async () => {
    expect(await first('水')).toMatchObject({ simplified: '水', pinyin: 'shuǐ', english: expect.arrayContaining(['water']) });
    expect(await first('東西')).toMatchObject({ simplified: '东西' }); // traditional headword
    for (const q of ['shui3', 'shuǐ', 'shui']) expect((await first(q))?.simplified).toBe('水');
    expect((await first('lv4'))?.pinyin).toBe('lǜ');
    expect((await first('water'))?.simplified).toBe('水');
    expect((await first('tea'))?.simplified).toBe('茶');
    expect(markSyllable('Wang2')).toBe('Wáng'); expect(markSyllable('gou3')).toBe('gǒu'); expect(markSyllable('lu:e4')).toBe('lüè'); expect(markSyllable('me5')).toBe('me');
  });
  it('rejects phrases and sentences with a friendly 422', async () => {
    for (const q of ['我要水', '你好吗', 'hello world', '水。', 'shui jiao']) {
      expect((await lookup(q, 422)).error).toMatchObject({ code: 'PHRASE_NOT_ALLOWED', message: expect.stringContaining('one word') });
    }
    expect((await lookup('', 400)).error.code).toBe('INVALID_REQUEST');
    expect(LookupResponseSchema.parse(await lookup('qqqzzz')).entries).toEqual([]);
  });
});

function annotateApp(client: ClaudeClient | null) {
  const mini = express();
  mini.use(express.json());
  mini.use('/api', createDictionaryRouter(config, { client }));
  const handler: ErrorRequestHandler = (error, _request, response, _next) => { response.status(error.status ?? 500).json({ error: { code: error.code, message: error.message, retryable: false } }); };
  mini.use(handler);
  return mini;
}
const annotate = async (target: express.Express, text: string) => AnnotateResponseSchema.parse((await request(target).post('/api/dictionary/annotate').send({ text }).expect(200)).body);

describe('dictionary annotate', () => {
  it('segments NPC lines into glossed words with whole-line pinyin', async () => {
    const hello = await annotate(app, '你好！你想喝什么？');
    expect(hello.tokens.map((token) => token.text)).toEqual(['你好', '！', '你', '想', '喝', '什么', '？']);
    expect(hello.tokens[0]).toMatchObject({ pinyin: 'nǐhǎo', entries: [expect.objectContaining({ simplified: '你好' })] });
    expect(hello.tokens[1]).toEqual({ text: '！' });
    expect(hello.pinyin).toBe('nǐhǎo! nǐ xiǎng hē shénme?');
    expect(hello.translationSource).toBe('none'); // test mode: no provider
    const price = await annotate(app, '好嘞，水五块。');
    expect(price.tokens.map((token) => token.text)).toEqual(['好', '嘞', '，', '水', '五', '块', '。']);
    expect(price.pinyin).toBe('hǎo lei, shuǐ wǔ kuài.');
  });
  it('uses authored English for exact authored lines without calling a provider', async () => {
    let called = 0;
    const target = annotateApp({ create: async () => { called++; throw new Error('unexpected'); } });
    expect(await annotate(target, '上海大酒店')).toMatchObject({ translation: 'Shanghai Grand Hotel', translationSource: 'authored' });
    expect(called).toBe(0);
  });
  it('translates other lines with Claude once, caches them, and degrades to none on failure', async () => {
    const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const ok: ClaudeClient = { create: async (params) => { seen.push(params); return { stop_reason: 'end_turn', content: [{ type: 'text', text: ' Sure, water is five kuai. ' }] } as unknown as Anthropic.Message; } };
    const target = annotateApp(ok);
    for (let i = 0; i < 2; i++) expect(await annotate(target, '好嘞，水五块。')).toMatchObject({ translation: 'Sure, water is five kuai.', translationSource: 'claude' });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.messages[0]!.content).toBe(JSON.stringify('好嘞，水五块。'));
    const failing = annotateApp({ create: async () => { throw new Error('timeout'); } });
    expect(await annotate(failing, '好嘞，水五块。')).toMatchObject({ translationSource: 'none' });
    expect((await annotate(failing, '好嘞，水五块。')).tokens.length).toBeGreaterThan(0);
  });
});
