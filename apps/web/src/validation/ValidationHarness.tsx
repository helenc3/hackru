import * as Collapsible from '@radix-ui/react-collapsible';
import { Button, TextField } from '../ui/primitives';
import { useState } from 'react';
import { sceneManifest, type RendererProps } from '@vibequest/shared';

/** The same HTTP actions and shared dialogue panel, in an isolated server validation session. */
export function ValidationHarness({ state, onAction, onTalk }: RendererProps) {
  const [playbackId, setPlaybackId] = useState('');
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_VALIDATION_HARNESS !== 'true' || !state.validationMode) return null;
  return <aside className="validation-panel" data-testid="validation-harness">
    <h2>Internal validation harness</h2><p>Developer-only session. Simulated achievements cannot transfer to player progress. Dialogue uses the same NPC panel and typed Mandarin fallback.</p>
    <h3>Locations</h3><div className="validation-controls">{sceneManifest.zones.map((zone) => <Button className="button secondary" key={zone.id} onClick={() => void onAction({ type: 'moveZone', zoneId: zone.id, position: zone.center }).catch(() => undefined)}>{zone.id}</Button>)}</div>
    <h3>Scene targets</h3><div className="validation-controls">{state.interactables.map((target) => {
      const located = sceneManifest.interactables.find((item) => item.id === target.id);
      return <Button className="button secondary" key={target.id} onClick={() => void (async () => {
        if (located) await onAction({ type: 'moveZone', zoneId: located.zoneId, position: target.position });
        if (target.kind === 'npc') onTalk(target.id);
        else if (target.kind === 'choice') await onAction({ type: 'choose', choiceId: target.id as Extract<Parameters<typeof onAction>[0], { type: 'choose' }>['choiceId'] });
        else if (target.kind === 'sign') await onAction({ type: 'inspect', targetId: target.id });
        else await onAction({ type: 'playCue', cueId: target.id as Extract<Parameters<typeof onAction>[0], { type: 'playCue' }>['cueId'], channel: 'validation-text' });
      })().catch(() => undefined)}>{target.kind} · {target.id}</Button>;
    })}</div>
    <form onSubmit={(event) => { event.preventDefault(); if (playbackId.trim()) void onAction({ type: 'finishCue', playbackId: playbackId.trim() }).catch(() => undefined); }}><label className="field-label">Server-issued cue playback ID<TextField.Root value={playbackId} onChange={(event) => setPlaybackId(event.target.value)} maxLength={128} /></label><Button type="submit" className="button secondary" disabled={!playbackId.trim()}>Finish delivered cue</Button></form>
    <Collapsible.Root><Collapsible.Trigger asChild><Button>Projected state · no evaluator or secret facts</Button></Collapsible.Trigger><Collapsible.Content><pre>{JSON.stringify(state, null, 2)}</pre></Collapsible.Content></Collapsible.Root>
  </aside>;
}
