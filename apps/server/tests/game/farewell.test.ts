import { describe, expect, it } from 'vitest';
import { campaign } from './helpers.js';

describe('farewell turns', () => {
  it('reports conversationEnded and pays at the counter through the same guards as the pay choice', async () => {
    const game = await campaign();
    await game.move('cafe'); await game.inspect('p1.entrance-sign'); await game.choose('p1.enter-plaza-door');
    await game.talk('我要茶。');
    const unpaid = await game.talk('再见。');
    expect(unpaid.body.conversationEnded).toBe(true);
    expect(game.state.objectives.find((objective) => objective.id === 'p1.receipt')?.complete).toBe(false);
    await game.talk('茶十元。');
    const paid = await game.talk('谢谢，再见。');
    expect(paid.body.conversationEnded).toBe(true); expect(paid.body.npcReply).toBe('谢谢，慢走！');
    expect(game.state.objectives.find((objective) => objective.id === 'p1.receipt')?.complete).toBe(true);
    await game.choose('p1.pay-cafe', 422);
    const plain = await game.talk('请再说一遍。');
    expect(plain.body.conversationEnded).toBeUndefined();
  });
});
