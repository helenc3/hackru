import { describe, expect, it } from 'vitest';
import { campaign } from './helpers.js';

describe('farewell turns', () => {
  it('reports conversationEnded and offers End conversation, but a goodbye never pays', async () => {
    const game = await campaign();
    const hello = await game.talk('你好。');
    expect(hello.body.actions).toEqual([]);
    await game.talk('我要茶。');
    const bye = await game.talk('再见。');
    expect(bye.body.conversationEnded).toBe(true);
    expect(bye.body.actions).toEqual([{ kind: 'pay', anchorId: 'an.vendor.spawn', drink: 'tea', priceCny: 10 }, { kind: 'end-conversation' }]);
    expect(game.state).toMatchObject({ status: 'active', purchases: [], inventory: { cny: 20 } });
    await game.pay();
    expect(game.state).toMatchObject({ status: 'cleared', inventory: { cny: 10, drinks: ['tea'] } });
    expect(game.state.npcActions).toEqual([{ anchorId: 'an.vendor.spawn', action: { kind: 'end-conversation' } }]);
    const plain = await game.talk('请再说一遍。', 'vendor', undefined, 422); // the attempt has ended
    expect(plain.body.conversationEnded).toBeUndefined();
  });
});
