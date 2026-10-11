export type NpcGender = 'male' | 'female';
export const NPC_IDENTITIES = {
  laowang: { gender: 'male', look: 'laozhou', voiceId: 'hZTuv9Zqrq4yHYrEmF1r' },
  xiaoli: { gender: 'male', look: 'achen', voiceId: '4VZIsMPtgggwNg7OXbPY' },
  xiaolin: { gender: 'female', look: 'xiaolin', voiceId: 'Ca5bKgudqKJzq8YRFoAz' },
  xiaomei: { gender: 'female', look: 'xiaolin', voiceId: 'Ca5bKgudqKJzq8YRFoAz' },
  ayi: { gender: 'female', look: 'xiaolin', voiceId: 'r6qgCCGI7RWKXCagm158' },
  achen: { gender: 'male', look: 'achen', voiceId: '4VZIsMPtgggwNg7OXbPY' },
  laozhou: { gender: 'male', look: 'laozhou', voiceId: 'hZTuv9Zqrq4yHYrEmF1r' },
  dazhang: { gender: 'male', look: 'achen', voiceId: '4VZIsMPtgggwNg7OXbPY' },
} as const;
export function npcIdentity(nameKey: string | undefined) {
  return nameKey && Object.hasOwn(NPC_IDENTITIES, nameKey) ? NPC_IDENTITIES[nameKey as keyof typeof NPC_IDENTITIES] : undefined;
}
