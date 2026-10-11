import { describe, expect, it } from 'vitest';
import { NPC_IDENTITIES, npcIdentity } from '../../src/city/npc-identity.js';
import { TEXT_CATALOG } from '../../src/city/text-catalog.js';

describe('NPC identities', () => {
  it('covers every reviewed name with a consistent gender, appearance and voice', () => {
    expect(Object.keys(NPC_IDENTITIES).sort()).toEqual(Object.keys(TEXT_CATALOG['npc-name']).sort());
    for (const identity of Object.values(NPC_IDENTITIES)) {
      expect(identity.look === 'xiaolin').toBe(identity.gender === 'female');
      expect(['Ca5bKgudqKJzq8YRFoAz', 'r6qgCCGI7RWKXCagm158'].includes(identity.voiceId)).toBe(identity.gender === 'female');
    }
    expect(npcIdentity('laowang')?.gender).toBe('male');
    expect(npcIdentity('ayi')?.gender).toBe('female');
    expect(npcIdentity('toString')).toBeUndefined();
  });
});
