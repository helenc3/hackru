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
        // Resume inside a gesture before the score's network request completes. Without an audio
        // device (CI runners) Firefox never settles this promise, so it must not gate setup:
        // scheduling already waits for the context to be running.
        void player.current.context.resume().catch(() => undefined);
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

  const label = failed ? 'Retry music' : !ready ? 'Enable music' : muted ? 'Unmute music' : 'Mute music';
  return <button type="button" className="button secondary topbar-icon" aria-label={label} title={label} aria-pressed={muted}
    onClick={() => { if (!ready) retry.current?.(); else setMuted((value) => !value); }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V5l11-2v13M9 8l11-2" /><ellipse cx="6" cy="18" rx="3" ry="2" /><ellipse cx="17" cy="16" rx="3" ry="2" />
      {muted && <path d="m3 3 18 18" />}
    </svg>
  </button>;
}
