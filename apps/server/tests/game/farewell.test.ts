import { describe, expect, it } from 'vitest';
import { campaign } from './helpers.js';

describe('farewell turns', () => {
  it('reports conversationEnded and offers End conversation; once Pay is up, only the button finishes', async () => {
    const game = await campaign(); await game.warm();
    const hello = await game.talk('你好。');
    expect(hello.body.actions).toEqual([]);
    const early = await game.talk('再见。');
    expect(early.body.conversationEnded).toBe(true);
    expect(early.body.actions).toEqual([{ kind: 'end-conversation' }]);
    await game.talk('我要茶。');
    const locked = await game.talk('再见。', 'vendor', undefined, 422);
    expect(locked.body.error.code).toBe('GOAL_ACTION_PENDING');
    expect(game.state).toMatchObject({ status: 'active', purchases: [], inventory: { cny: 20 } });
    await game.pay();
    expect(game.state).toMatchObject({ status: 'cleared', inventory: { cny: 10, drinks: ['tea'] } });
    expect(game.state.npcActions).toEqual([{ anchorId: 'an.vendor.spawn', action: { kind: 'end-conversation' } }]);
    const plain = await game.talk('请再说一遍。', 'vendor', undefined, 422); // the attempt has ended
    expect(plain.body.conversationEnded).toBeUndefined();
  });
});
