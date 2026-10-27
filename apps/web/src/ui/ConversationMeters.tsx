import type { NpcId, PublicState, TurnResponse } from '@vibequest/shared';

const moods = { warm: { level: 3, word: 'Friendly' }, neutral: { level: 2, word: 'Getting busy' }, terse: { level: 1, word: 'Impatient' }, disengaged: { level: 0, word: 'Leaving' } } as const;
export function ConversationMeters({ state, role, turn }: { state: PublicState; role: NpcId; turn: TurnResponse | null }) {
  const mood = state.npcMood[role];
  return <aside className="conversation-meters" aria-label="Conversation meters" data-testid="conversation-meters">
    <div className="conversation-mood" data-mood={mood}><span>Mood</span><meter min={0} max={3} value={moods[mood].level} aria-label="Mood" aria-valuetext={moods[mood].word} /></div>
    {(['clarity', 'courtesy'] as const).map((dimension) => {
      const score = turn?.vibe?.[dimension];
      const label = dimension === 'clarity' ? 'Clarity' : 'Courtesy';
      return <div key={dimension} data-pending={score === undefined}><span>{label}</span><meter min={0} max={1} value={score ?? 0} aria-label={label} {...(score === undefined ? { 'aria-valuetext': 'Awaiting your first evaluated reply' } : {})} /><span>{score === undefined ? '—' : `${Math.round(score * 100)}%`}</span></div>;
    })}
  </aside>;
}
