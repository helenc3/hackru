import { useEffect, useRef, useState } from 'react';
import type { AudioControllerProps } from '@vibequest/shared';
import { fetchCuePlayback, fetchSpeech, setAudioActivity, setInterrupt, useAudioActivity } from './audio-bus';

/** PA tracks carry the earliest time the server accepts finishCue for them. */
type Track = { kind: 'speech'; id: string; url: string } | { kind: 'pa'; id: string; url: string; finishAt: number };

/** One playback lane for NPC replies and PA. Playback never changes quest state by itself. */
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
  const handledCues = useRef(new Set<string>()); // PA playback IDs already started locally
  const finishedCues = useRef(new Set<string>()); // PA playback IDs reported via finishCue
  const scope = useRef(0);
  const attempt = `${state.sessionId}:${state.missionId}:${state.status}`;
  const hasAudioCue = state.visibleCues.some((entry) => entry.audioAssetId && !entry.text);

  function audio(): HTMLAudioElement {
    element.current ??= new Audio();
    return element.current;
  }

  /**
   * Ends the current track; only the first play of a speech operation reports its phases.
   * PA reports finishCue only after audio actually ended: stopped or failed PA stays replayable.
   */
  function settle(track: Track, ended: boolean, report: boolean): Promise<void> {
    if (playing.current !== track) return Promise.resolve();
    playing.current = null;
    if (track.kind === 'speech') {
      setAudioActivity('idle');
      return report ? onAction({ type: 'audioPhase', operationId: track.id, phase: 'idle' }).then(() => undefined, () => undefined) : Promise.resolve();
    }
    if (!ended || finishedCues.current.has(track.id)) { setAudioActivity('idle'); return Promise.resolve(); }
    finishedCues.current.add(track.id);
    const token = scope.current;
    // Keep the lane busy until the server records delivery so a recording cannot collide with it.
    setTimeout(() => {
      if (token !== scope.current) return;
      void onAction({ type: 'finishCue', playbackId: track.id })
        .catch(() => { finishedCues.current.delete(track.id); setStatus('The announcement could not be confirmed. Replay it.'); })
        .finally(() => { if (token === scope.current && !playing.current) setAudioActivity('idle'); });
    }, Math.max(0, track.finishAt - Date.now()));
    return Promise.resolve();
  }

  async function play(track: Track, replay = false) {
    void stop();
    const token = scope.current;
    const report = !replay && !announced.current.has(track.id);
    if (report && track.kind === 'speech') {
      try { await onAction({ type: 'audioPhase', operationId: track.id, phase: 'playing' }); } catch {
        setFailed(track.id); setStatus('The reply audio could not start. Retry playback or read the reply.'); return;
      }
    }
    if (token !== scope.current) return;
    if (report) announced.current.add(track.id);
    const player = audio();
    playing.current = track; last.current = track;
    setAudioActivity(track.kind === 'speech' ? 'playing' : 'announcing'); setFailed(null); setBlockedTrack(null);
    player.muted = muted;
    player.src = track.url;
    player.onended = () => { setStatus('Audio ready'); settle(track, true, report); };
    player.onerror = () => { setFailed(track.id); setStatus('Audio playback failed. Retry or read the reply.'); settle(track, false, report); };
    setStatus(track.kind === 'speech' ? 'Playing reply…' : 'Playing announcement…');
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
      void play({ kind: 'speech', id: speechId, url });
    }).catch(() => { if (!controller.signal.aborted) { setFailed(speechId); setStatus('Reply audio is unavailable. Retry or read the reply.'); } });
    return () => { controller.abort(); if (url && last.current?.url !== url) URL.revokeObjectURL(url); };
  }, [speechId, state.sessionId, refetch]);

  // Server-acknowledged PA playback (audio channel) plays the reviewed local asset once.
  useEffect(() => {
    if (!hasAudioCue) return;
    const controller = new AbortController();
    const token = scope.current;
    fetchCuePlayback(state.sessionId, controller.signal).then((cue) => {
      if (!cue || token !== scope.current || handledCues.current.has(cue.playbackId)) return;
      handledCues.current.add(cue.playbackId);
      void play({ kind: 'pa', id: cue.playbackId, url: `/audio/${encodeURIComponent(cue.audioAssetId)}.mp3`, finishAt: Date.now() + cue.finishAfterMs });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [state.sessionId, state.version, hasAudioCue]);

  // Retry/new attempt: stop everything and ignore late audio.
  useEffect(() => () => {
    scope.current++;
    element.current?.pause();
    playing.current = null; last.current = null; setAudioActivity('idle');
  }, [attempt]);
  useEffect(() => { if (element.current) element.current.muted = muted; }, [muted]);

  const busy = (activity === 'playing' || activity === 'announcing') && Boolean(playing.current);
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
