import type { SkillDebriefProps } from '@vibequest/shared';

/** Segment-006 consumes the server-projected debrief after a terminal result. */
export function SkillDebrief({ state }: SkillDebriefProps) {
  return (
    <div className="debrief-slot" data-testid="skill-debrief-stub">
      <span className="debrief-icon" aria-hidden="true">↗</span>
      <div>
        <strong>Every conversation moves you forward.</strong>
        <p>Skill adaptation & evidence debrief · Unimplemented · Segment-006</p>
      </div>
      <span className="small-label">{state.debrief ? 'Debrief fixture available' : 'No completed mission yet'}</span>
    </div>
  );
}
