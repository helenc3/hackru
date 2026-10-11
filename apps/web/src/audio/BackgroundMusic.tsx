import { useEffect, useRef, useState } from 'react';
import { useAudioActivity } from './audio-bus';
import { BackgroundMusicPlayer, type MusicScore } from './background-music';

export function BackgroundMusic({ active, conversation }: { active: boolean; conversation: boolean }) {
  const activity = useAudioActivity();
  const player = useRef<BackgroundMusicPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);
  const first = useRef(true);
  const retry = useRef<(() => void) | null>(null);

  useEffect(() => {
    let disposed = false;
    let loading = false;
    const controller = new AbortController();
    const begin = async () => {
      if (loading || disposed) return;
      loading = true;
      try {
        player.current ??= new BackgroundMusicPlayer();
        // Resume inside a gesture before the score's network request completes.
        await player.current.context.resume();
        const response = await fetch('/music/song.json', { signal: controller.signal });
        if (!response.ok) throw new Error('Music unavailable');
        const score = await response.json() as MusicScore;
        if (disposed) return;
        await player.current.start(score);
        setReady(true); setFailed(false);
        window.removeEventListener('pointerdown', gesture);
        window.removeEventListener('keydown', gesture);
      } catch {
        if (!disposed) { setFailed(true); loading = false; }
      }
    };
    const gesture = () => {
      // A blocked resume may still be pending from mounting outside a user gesture.
      void player.current?.context.resume().catch(() => undefined);
      void begin();
    };
    retry.current = gesture;
    const visibility = () => {
      const context = player.current?.context;
      if (context) void (document.hidden ? context.suspend() : context.resume()).catch(() => undefined);
    };
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    document.addEventListener('visibilitychange', visibility);
    // A preceding Start click often already unlocked audio; otherwise the next gesture starts it.
    gesture();
    return () => {
      disposed = true; controller.abort(); retry.current = null;
      window.removeEventListener('pointerdown', gesture);
      window.removeEventListener('keydown', gesture);
      document.removeEventListener('visibilitychange', visibility);
      player.current?.dispose(); player.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const silent = muted || !active || activity === 'recording';
    const ducked = conversation || activity === 'playing';
    const level = silent ? 0 : ducked ? .045 : .24;
    player.current?.setLevel(level, first.current ? 8 : silent ? .12 : ducked ? .35 : 2.5);
    first.current = false;
  }, [ready, active, conversation, activity, muted]);

  return <button type="button" className="button secondary" aria-pressed={muted}
    onClick={() => { if (!ready) retry.current?.(); else setMuted((value) => !value); }}>
    {failed ? 'Retry music' : !ready ? 'Enable music' : muted ? 'Unmute music' : 'Mute music'}
  </button>;
}
