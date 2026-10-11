import type { SkillDebriefProps } from '@vibequest/shared';

/** Only the server's terminal projection supplies evidence and recommendations. */
export function SkillDebrief({ state }: SkillDebriefProps) {
  if (state.status === 'active' || !state.debrief) return null;
  const { tracks, strengths, improvement, nextPracticeReason, evidenceSummary: summary } = state.debrief;
  return (
    <section className="skill-debrief" style={{ fontSize: 14, lineHeight: 1.5, padding: 20 }} data-testid="skill-debrief" aria-label="Mission skill debrief">
      <div>
        <h2>{state.status === 'cleared' ? 'Mission complete' : 'Practice after this attempt'}</h2>
        {state.validationMode && <p>Developer validation: simulated progress, no player achievement.</p>}
        <h3>Actions demonstrated independently</h3>
        {strengths.length ? <ul>{strengths.map((strength) => <li key={strength}>{strength}</li>)}</ul> : <p>No independent success recorded yet.</p>}
        <p>{improvement}</p>
        <dl>{Object.entries(tracks).map(([track, skill]) => <div key={track}>
          <dt>{track}</dt>
          <dd>{skill.independentCount === 0 ? 'Untested' : `${Math.round(skill.mastery * 100)}% practice estimate · ${skill.independentCount} independent decisions`}</dd>
        </div>)}</dl>
        <h3>Next practice</h3>
        <p>{nextPracticeReason}</p>
        {state.badges.includes('station-navigator') && <p>{state.validationMode ? 'Simulated badge evidence' : 'Badge evidence'}: the session’s earned badge uses the modality summary below.</p>}
        <p>Conversation: {summary.spokenTurns} verified spoken, {summary.typedTurns} typed, {summary.editedTurns} edited transcript turns.</p>
        <p>Listening: {summary.independentListening} independent, {summary.assistedListening} assisted decisions. Subtitles and validation do not count as independent listening.</p>
        <p>These practice estimates do not assess pronunciation or certify a language level.</p>
      </div>
    </section>
  );
}
