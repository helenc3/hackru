import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildPrompt } from '../../src/providers/gemini/prompt.js';
import { dialogueContext } from '@vibequest/shared';
import { advance, ANCHORS, campaign, fakeWorldView, fixtureApp, ROUTE } from './helpers.js';

describe('session conversation language', () => {
  it('defaults to Mandarin and keeps English off-target in a Mandarin session', async () => {
    const game = await campaign();
    expect(game.state.language).toBe('zh');
    const reply = await game.talk('Can you take my photo?');
    expect(reply.body.npcReply).toMatch(/[\u4e00-\u9fff]/);
    expect(game.state.completedMissionIds).toEqual([]);
  });

  it('completes all three quests in English with the same prices and verified world actions', async () => {
    const game = await campaign('fixture', false, 'en');
    expect(game.state.interactables.find((item) => item.id === ANCHORS.vendor.id)?.label).toBe('Lao Wang');
    const chat = async (request: string, role: 'vendor' | 'guide' | 'passerby') => {
      let response = await game.talk(request, role);
      for (let i = 0; i < 4; i++) response = await game.talk('I am from America.', role);
      expect(response.body.npcReply).not.toMatch(/[\u4e00-\u9fff]/);
      return response;
    };
    const order = await chat('I want tea.', 'vendor');
    expect(order.body.npcReply).toContain('10 yuan');
    await game.pay();
    expect(game.state.status).toBe('cleared');
    expect(game.state.inventory.cny).toBe(10);
    expect(game.state.inventory.drinks).toEqual(['tea']);
    await game.act({ type: 'startMission', missionId: 'Q2' });
    expect(game.state.language).toBe('en');
    await game.walkTo(ANCHORS.guide.position);
    const directions = await chat('How do I get to the Shanghai Grand Hotel?', 'guide');
    expect(directions.body.npcReply).toBe(ROUTE.steps.map((step) => step.english).join('. ') + '.');
    expect(game.state.status).toBe('cleared');
    expect(game.state.directions?.routeId).toBe(ROUTE.routeId);
    await game.act({ type: 'startMission', missionId: 'Q3' });
    await game.walkTo(ANCHORS.passerby.position);
    await chat('Can you take my photo?', 'passerby');
    expect(game.state.photo?.status).toBe('accepted');
    await game.walkTo(game.state.photo!.spot);
    await game.startPhoto();
    advance(3100);
    await game.capture('captured');
    expect(game.state.status).toBe('cleared');
    expect(game.state.completedMissionIds).toEqual(['Q1', 'Q2', 'Q3']);
    const resumed = await request(game.app).get(`/api/sessions/${game.state.sessionId}`).expect(200);
    expect(resumed.body.state.language).toBe('en');
  });

  it('rejects unsupported languages and mid-session language changes', async () => {
    const { app } = fixtureApp();
    await request(app).post('/api/sessions').send({ initialTier: 0, providerMode: 'fixture', language: 'fr' }).expect(400);
    const game = await campaign('fixture', false, 'en');
    await request(game.app).post(`/api/sessions/${game.state.sessionId}/actions`).send({ actionId: 'change-language', expectedVersion: game.state.version, action: { type: 'setLanguage', language: 'zh' } }).expect(400);
    expect((await request(game.app).get(`/api/sessions/${game.state.sessionId}`)).body.state.language).toBe('en');
  });

  it('uses English model instructions and passes the session language to transcription', async () => {
    const game = await campaign('fixture', false, 'en');
    const state = (await game.session()).state;
    const context = dialogueContext(state, 'vendor', ANCHORS.vendor.id, fakeWorldView());
    const prompt = buildPrompt(context, 'I want tea.').systemInstruction;
    expect(prompt).toContain('English-only input is yes, never no');
    expect(prompt).not.toContain('no English');
    expect(context.facts.coffee).toBe('Sold out');
    const transcribe = vi.fn().mockResolvedValue('I want tea.');
    game.services.speechProvider.transcribe = transcribe;
    await game.act({ type: 'audioPhase', operationId: 'record-english', phase: 'recording' });
    await request(game.app).post(`/api/sessions/${game.state.sessionId}/transcriptions`)
      .field('operationId', 'record-english').attach('audio', Buffer.from('fixture-audio'), { filename: 'clip.webm', contentType: 'audio/webm' }).expect(200);
    expect(transcribe).toHaveBeenCalledWith(expect.any(Uint8Array), 'audio/webm', 'en');
  });
});
