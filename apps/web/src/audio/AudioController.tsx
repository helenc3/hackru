import { useEffect, useRef, useState } from 'react';
import type { AudioControllerProps } from '@vibequest/shared';
import { fetchSpeech, setAudioActivity, setInterrupt, useAudioActivity } from './audio-bus';

type Track = { id: string; url: string };

/** One playback lane for NPC replies. Playback never changes quest state by itself. */
export function AudioController({ state, onAction, speechId }: AudioControllerProps) {
  const element = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState('Audio ready');
  const [failed, setFailed] = useState<string | null>(null);
  const [blockedTrack, setBlockedTrack] = useState<Track | null>(null);
  const [refetch, setRefetch] = useState(0);
  const activity = useAudioActivity();
  const last = useRef<Track | null>(null);
  const playing = useRef<Track | null>(null);
  const announced = useRef(new Set<string>()); // operation IDs whose 'playing' phase was sent
  const scope = useRef(0);
  const attempt = `${state.sessionId}:${state.missionId}:${state.status}`;

  function audio(): HTMLAudioElement {
    element.current ??= new Audio();
    return element.current;
  }

  /** Ends the current track; only the first play of a speech operation reports its phases. */
  function settle(track: Track, _ended: boolean, report: boolean): Promise<void> {
    if (playing.current !== track) return Promise.resolve();
    playing.current = null;
    setAudioActivity('idle');
    return report ? onAction({ type: 'audioPhase', operationId: track.id, phase: 'idle' }).then(() => undefined, () => undefined) : Promise.resolve();
  }

  async function play(track: Track, replay = false) {
    void stop();
    const token = scope.current;
    const report = !replay && !announced.current.has(track.id);
    if (report) {
      try { await onAction({ type: 'audioPhase', operationId: track.id, phase: 'playing' }); } catch {
        setFailed(track.id); setStatus('The reply audio could not start. Retry playback or read the reply.'); return;
      }
    }
    if (token !== scope.current) return;
    if (report) announced.current.add(track.id);
    const player = audio();
    playing.current = track; last.current = track;
    setAudioActivity('playing'); setFailed(null); setBlockedTrack(null);
    player.muted = muted;
    player.src = track.url;
    player.onended = () => { setStatus('Audio ready'); settle(track, true, report); };
    player.onerror = () => { setFailed(track.id); setStatus('Audio playback failed. Retry or read the reply.'); settle(track, false, report); };
    setStatus('Playing reply…');
    try { await player.play(); } catch (error) {
      // Autoplay policy: keep the operation open briefly and let a click start it.
      if (error instanceof DOMException && error.name === 'NotAllowedError') { setBlockedTrack(track); setStatus('Click Play to hear the reply.'); return; }
      setFailed(track.id); setStatus('Audio playback failed. Retry or read the reply.'); settle(track, false, report);
    }
  }

  /** Resolves once the server knows the speech operation ended, so a recording can follow it. */
  function stop(): Promise<void> {
    const track = playing.current;
    element.current?.pause();
    if (!track) return Promise.resolve();
    setStatus('Audio stopped');
    return settle(track, false, true);
  }
  // The recorder barges in through the bus; re-register each render so stop() sees current props.
  useEffect(() => { setInterrupt(stop); return () => setInterrupt(null); });

  // New NPC reply: wait for the server's speech job, then play it once.
  useEffect(() => {
    if (!speechId) return;
    const controller = new AbortController();
    const token = scope.current;
    let url: string | null = null;
    setStatus('Preparing reply audio…'); setFailed(null);
    fetchSpeech(state.sessionId, speechId, controller.signal).then((clip) => {
      if (controller.signal.aborted || token !== scope.current) return;
      url = URL.createObjectURL(clip);
      void play({ id: speechId, url });
    }).catch(() => { if (!controller.signal.aborted) { setFailed(speechId); setStatus('Reply audio is unavailable. Retry or read the reply.'); } });
    return () => { controller.abort(); if (url && last.current?.url !== url) URL.revokeObjectURL(url); };
  }, [speechId, state.sessionId, refetch]);

  // Retry/new attempt: stop everything and ignore late audio.
  useEffect(() => () => {
    scope.current++;
    element.current?.pause();
    playing.current = null; last.current = null; setAudioActivity('idle');
  }, [attempt]);
  useEffect(() => { if (element.current) element.current.muted = muted; }, [muted]);

  const busy = activity === 'playing' && Boolean(playing.current);
  return (
    <div className="audio-status" data-testid="audio-controller" role="group" aria-label="Audio controls">
      <span aria-hidden="true">♫</span>
      <span role="status">{status}</span>
      {blockedTrack && <button type="button" className="button secondary" onClick={() => { const track = blockedTrack; setBlockedTrack(null); void audio().play().catch(() => settle(track, false, true)); setStatus('Playing reply…'); }}>Play</button>}
      <button type="button" className="button secondary" aria-pressed={muted} onClick={() => setMuted((value) => !value)}>{muted ? 'Unmute' : 'Mute'}</button>
      <button type="button" className="button secondary" disabled={!busy} onClick={() => stop()}>Stop</button>
      <button type="button" className="button secondary" disabled={busy || !last.current} onClick={() => { if (last.current) void play(last.current, true); }}>Replay</button>
      {failed && speechId === failed && <button type="button" className="button secondary" onClick={() => { setFailed(null); if (last.current?.id === failed) void play(last.current, true); else setRefetch((count) => count + 1); }}>Retry audio</button>}
    </div>
  );
}
