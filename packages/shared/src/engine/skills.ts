import type { EvidenceRecord, InternalState, MissionId, Tier, Track } from '../contracts.js';
import { missionFor } from '../content/missions.js';

const tracks: Track[] = ['reading', 'listening', 'conversation', 'repair'];
const actions: Record<Track, string> = {
  reading: 'Read Mandarin world text before acting',
  listening: 'Followed spoken Mandarin without subtitles',
  conversation: 'Communicated a relevant request in Mandarin',
  repair: 'Recovered independently after a misunderstanding',
};
const challenges: Record<Track, string> = {
  reading: 'read the menu or sign before you ask',
  listening: 'listen to the spoken reply before opening subtitles',
  conversation: 'confirm the requested item and its details in Mandarin',
  repair: 'add the missing detail when the NPC asks you to clarify',
};

/** First decisions own their cue, including an incorrect or assisted first decision. */
function attemptUnits(state: InternalState): EvidenceRecord[] {
  const seen = new Set<string>();
  const assistedSeen = new Set<string>();
  return state.evidence.filter((unit) => {
    if (unit.attemptId !== state.attemptId || unit.missionId !== state.missionId || unit.providerFailure) return false;
    const key = `${unit.track}:${unit.cueId ?? unit.turnId ?? unit.id}`;
    if (seen.has(key)) {
      if (unit.independent || assistedSeen.has(key)) return false;
      assistedSeen.add(key);
    }
    seen.add(key);
    if (!unit.independent) assistedSeen.add(key);
    return true;
  });
}
const eligible = (unit: EvidenceRecord) => unit.independent && unit.firstAttempt && !unit.validationMode && !unit.providerFailure && !unit.listeningAssisted;

export function selectPracticeTier(state: InternalState, missionId: MissionId): Tier {
  const targets = missionFor(missionId).variants[0]!.targetTracks;
  const observed = targets.map((track) => state.skills[track]);
  const count = observed.reduce((sum, skill) => sum + skill.independentCount, 0);
  const mean = observed.length ? observed.reduce((sum, skill) => sum + skill.mastery, 0) / observed.length : 0.4;
  // Summing decimal mastery values can put an exact threshold one ULP below itself.
  const tolerance = Number.EPSILON * observed.length;
  const change = count >= 3 && mean >= 0.65 - tolerance ? 1 : count >= 2 && mean < 0.35 - tolerance ? -1 : 0;
  return Math.max(0, Math.min(2, state.difficulty + change)) as Tier;
}

export function updateSkillsAfterAttempt(state: InternalState): InternalState {
  if (state.status === 'active' || state.skillUpdatedAttemptIds.includes(state.attemptId)) return state;
  const next = structuredClone(state);
  const units = attemptUnits(next);
  for (const track of tracks) {
    const independent = units.filter((unit) => unit.track === track && eligible(unit));
    if (!independent.length) continue;
    const mean = independent.reduce((sum, unit) => sum + unit.score, 0) / independent.length;
    next.skills[track].mastery = 0.75 * next.skills[track].mastery + 0.25 * mean;
    next.skills[track].independentCount += independent.length;
  }
  next.skillUpdatedAttemptIds.push(next.attemptId);
  const observed = tracks.filter((track) => next.skills[track].independentCount > 0);
  const weakest = [...observed].sort((a, b) => next.skills[a].mastery - next.skills[b].mastery)[0];
  const correction = units.find((unit) => eligible(unit) && unit.score < 1);
  const practiceId = weakest === 'conversation' || weakest === 'reading' ? 'Q1' : next.missionId;
  const tier = selectPracticeTier(next, practiceId);
  const movement = tier > next.difficulty ? 'adds a harder authored challenge' : tier < next.difficulty ? 'uses simpler authored cues' : 'keeps the current cue complexity';
  const reason = weakest
    ? `After ${next.skills[weakest].independentCount} ${weakest} decisions, ${practiceId} practice ${movement} (tier ${tier}): ${challenges[weakest]}.`
    : `No independent decisions were recorded; ${practiceId} practice keeps tier ${tier}. Try speaking with an NPC and act on what they say.`;
  next.debrief = {
    tracks: structuredClone(next.skills),
    strengths: tracks.filter((track) => units.some((unit) => unit.track === track && eligible(unit) && unit.score === 1)).map((track) => actions[track]),
    improvement: correction ? `Next time, ${challenges[correction.track]}.` : units.some((unit) => !eligible(unit)) ? 'Try the same decision independently before opening an example or subtitles.' : 'Keep connecting Mandarin cues to a concrete world action.',
    nextPracticeMissionId: practiceId,
    nextPracticeReason: `${reason}${next.skills.listening.independentCount === 0 ? ' Listening is untested: keep subtitles off.' : ''}`,
    evidenceSummary: {
      spokenTurns: units.filter((unit) => unit.track === 'conversation' && unit.conversationSource === 'spoken').length,
      typedTurns: units.filter((unit) => unit.track === 'conversation' && unit.conversationSource === 'typed').length,
      editedTurns: units.filter((unit) => unit.track === 'conversation' && unit.conversationSource === 'edited').length,
      independentListening: units.filter((unit) => unit.track === 'listening' && eligible(unit)).length,
      assistedListening: units.filter((unit) => unit.track === 'listening' && (!eligible(unit))).length,
    },
  };
  return next;
}
