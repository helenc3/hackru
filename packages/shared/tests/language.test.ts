import { describe, expect, it } from 'vitest';
import { conversationContent, CreateSessionRequestSchema, directionsText, isClosingLine, MAX_NPC_REPLY_LENGTH, worldText, type Directions } from '../src/index.js';

describe('English testing content', () => {
  it('defaults old session requests to Mandarin and translates catalog signs without changing their IDs', () => {
    expect(CreateSessionRequestSchema.parse({ initialTier: 0, providerMode: 'fixture' }).language).toBe('zh');
    expect(worldText('上海大酒店', 'en')).toBe('Shanghai Grand Hotel');
    expect(worldText('茶 十元\n水 五元\n咖啡 卖完了', 'en')).toBe('Tea ¥10 · Water ¥5 · Coffee sold out');
    expect(worldText('上海大酒店')).toBe('上海大酒店');
    expect(conversationContent('en').groundedReplies.coffeeUnavailable).toContain('sold out');
    expect(conversationContent().groundedReplies.coffeeUnavailable).toBe('咖啡卖完了。我们有茶和水。');
  });
  it('keeps every verified direction step, even when English is longer than the original reply limit', () => {
    const route: Directions = { routeId: 'route.long', fromAnchorId: 'guide', hotelAnchorId: 'hotel', textZh: '一直走。', steps: Array.from({ length: 8 }, (_, i) => ({ textZh: '一直走', english: `Step ${i + 1}: walk along this street past the park and turn right onto the next road`.padEnd(240, '.') })) };
    const reply = directionsText(route, 'en');
    expect(reply.length).toBeGreaterThan(240);
    expect(reply.length).toBeLessThanOrEqual(MAX_NPC_REPLY_LENGTH);
    for (const step of route.steps) expect(reply).toContain(step.english);
    expect(directionsText(route)).toBe(route.textZh);
  });
  it('recognizes English goodbyes without treating a clarification as a goodbye', () => {
    expect(isClosingLine('Goodbye!')).toBe(true);
    expect(isClosingLine('Take care!')).toBe(true);
    expect(isClosingLine('Come again?')).toBe(false);
    expect(isClosingLine('再见！')).toBe(true);
  });
});
