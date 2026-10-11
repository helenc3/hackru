import { Button } from './primitives';
import { CueIdSchema, sceneManifest, type GameAction, type PublicState } from '@vibequest/shared';

/** Affordances only: proximity and mission guards remain server-owned. */
export function WorldInteractions({ state, pending, onAction, onTalk, onShowSubtitles }: {
  state: PublicState; pending: boolean; onAction: (action: GameAction) => Promise<void>;
  onTalk: (id: string) => void; onShowSubtitles: (id: string) => void;
}) {
  const available = state.interactables.filter((item) => sceneManifest.interactables.find((target) => target.id === item.id)?.zoneId === state.zoneId);
  // These affordances reflect server-published interactions. The server owns proximity and guards.
  const choices = available.filter((item) => item.kind === 'choice');
  const signs = available.filter((item) => item.kind === 'sign');
  const broadcasts = available.filter((item) => item.kind === 'pa');
  const speakers = available.filter((item) => item.kind === 'npc');

  return <div className="world-action-stack">
      <section className="interaction-dock" aria-label="World interactions"><div>
        {speakers.map((item) => <Button className="button secondary" key={item.id} disabled={pending || state.status !== 'active'} onClick={() => onTalk(item.id)}><span lang="zh-Hans">{item.label}</span> · Talk</Button>)}
        {signs.map((item) => <Button className="button secondary" key={item.id} disabled={pending || state.status !== 'active'} onClick={() => void onAction({ type: 'inspect', targetId: item.id }).catch(() => undefined)}><span lang="zh-Hans">{item.label}</span> · Read sign</Button>)}
        {broadcasts.map((item) => <div className="cue-actions" key={item.id}><span lang="zh-Hans">{item.label}</span><Button className="button secondary" disabled={pending || state.status !== 'active'} onClick={() => void onAction({ type: 'playCue', cueId: CueIdSchema.parse(item.id), channel: 'audio' }).catch(() => undefined)}>Listen</Button><Button className="button secondary" disabled={pending || state.status !== 'active'} onClick={() => void onAction({ type: 'playCue', cueId: CueIdSchema.parse(item.id), channel: 'subtitles' }).then(() => onShowSubtitles(item.id)).catch(() => undefined)}>Chinese subtitles</Button></div>)}
      </div></section>
      {state.status === 'active' && <section className="choice-dock" aria-label="Mission actions">{choices.map((item) => <Button className="button secondary" key={item.id} disabled={pending} onClick={() => void onAction({ type: 'choose', choiceId: item.id as Extract<GameAction, { type: 'choose' }>['choiceId'] }).catch(() => undefined)} lang="zh-Hans">{item.label}</Button>)}</section>}
  </div>;
}
