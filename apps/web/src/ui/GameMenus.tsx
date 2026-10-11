import { Button, Theme } from './primitives';
import { useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import * as Slider from '@radix-ui/react-slider';
import { useAudioSettings, updateAudioSettings } from '../audio/audio-settings';

function Popup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <Dialog.Portal><Dialog.Overlay className="menu-backdrop" /><Theme asChild><Dialog.Content className="game-popup" onCloseAutoFocus={(event) => { event.preventDefault(); document.querySelector<HTMLElement>('[data-testid="world-renderer"]')?.focus(); }}>
    <Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description>
    <Dialog.Close asChild><Button className="icon-button popup-close" aria-label={`Close ${title}`}>×</Button></Dialog.Close>{children}
  </Dialog.Content></Theme></Dialog.Portal>;
}
function Controls() {
  return <dl className="controls-list"><dt>WASD / Arrow keys</dt><dd>Walk</dd><dt>Drag the world</dt><dd>Turn the camera</dd><dt>E</dt><dd>Interact with the nearest target</dd><dt>Click the world</dt><dd>Return to movement controls</dd></dl>;
}
export function GameMenus({ pending, restartPending, active, onRestart, onLeave, onRefresh }: { pending: boolean; restartPending: boolean; active: boolean; onRestart: () => void; onLeave: () => void; onRefresh: () => void }) {
  const [controls, setControls] = useState(true);
  const [settings, setSettings] = useState(false);
  const audio = useAudioSettings();
  const [audioOpen, setAudioOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openAudio = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setAudioOpen(true); };
  const closeAudio = () => { hoverTimer.current = setTimeout(() => setAudioOpen(false), 200); };
  return <div className="game-menus">
    <Popover.Root open={audioOpen} onOpenChange={setAudioOpen}><Popover.Anchor asChild><Button className="icon-button" aria-label={audio.muted ? 'Unmute audio' : 'Mute audio'} aria-pressed={audio.muted} onPointerEnter={openAudio} onPointerLeave={closeAudio} onFocus={openAudio} onClick={() => updateAudioSettings({ muted: !audio.muted })}> {audio.muted ? '♬̸' : '♬'} </Button></Popover.Anchor>
      <Popover.Portal><Theme asChild><Popover.Content className="audio-menu" sideOffset={12} onPointerEnter={openAudio} onPointerLeave={closeAudio} onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}>
        {(['music', 'speakers'] as const).map((channel) => <div className="volume-control" key={channel}><label id={`${channel}-label`}>{channel === 'music' ? 'Music' : 'Speakers'} <span>{Math.round(audio[channel] * 100)}%</span></label><Slider.Root className="volume-slider" aria-labelledby={`${channel}-label`} value={[audio[channel] * 100]} onValueChange={([value]) => updateAudioSettings({ [channel]: value / 100 })} max={100} step={1}><Slider.Track className="volume-track"><Slider.Range className="volume-range" /></Slider.Track><Slider.Thumb className="volume-thumb" aria-label={`${channel} volume`} /></Slider.Root></div>)}
      </Popover.Content></Theme></Popover.Portal>
    </Popover.Root>
    <Dialog.Root open={settings} onOpenChange={setSettings}><Dialog.Trigger asChild><Button className="icon-button" aria-label="Settings">⚙</Button></Dialog.Trigger><Popup title="Settings" description="Manage your game session."><div className="settings-actions"><Button className="button secondary" onClick={() => { setSettings(false); setControls(true); }}>Controls</Button>{active && <Button className="button secondary" disabled={restartPending} onClick={() => { onRestart(); setSettings(false); }}>Restart mission</Button>}<Button className="button secondary" disabled={pending} onClick={onRefresh}>Refresh session</Button><Button className="button secondary" disabled={pending} onClick={onLeave}>Leave session</Button></div></Popup></Dialog.Root>
    <Dialog.Root open={controls} onOpenChange={setControls}><Popup title="Controls" description="Explore the world and follow your current goal."><Controls /><Dialog.Close asChild><Button className="button primary">Let's play</Button></Dialog.Close></Popup></Dialog.Root>
  </div>;
}
