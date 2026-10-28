import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { languageName, type RecorderProps } from '@vibequest/shared';
import { AudioApiError, finishConfirmation, interruptPlayback, setAudioActivity, setConfirmation, uploadClip, useAudioActivity } from './audio-bus';

const MAX_MS = 15_000;
const MAX_BYTES = 3 * 1024 * 1024;
const HOLD_MS = 350; // shorter presses are taps (toggle); longer ones are hold-to-talk
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];

type Status = 'idle' | 'starting' | 'recording' | 'transcribing' | 'error' | 'denied' | 'unsupported';
type Capture = { operationId: string; recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; bytes: number; cancelled: boolean; timer: ReturnType<typeof setTimeout> };

function supportedMime(): string | null {
  if (typeof window.MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/** User-activated push-to-record. Transcripts are proposals: only the panel's Send creates a turn. */
export function Recorder({ state, onAction, onTranscript }: RecorderProps) {
  const language = languageName(state.language);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const capture = useRef<Capture | null>(null);
  const upload = useRef<AbortController | null>(null);
  const press = useRef<{ at: number; started: boolean } | null>(null);
  const pendingStop = useRef(false); // released a hold before getUserMedia resolved
  const activity = useAudioActivity();
  const attempt = `${state.sessionId}:${state.missionId}:${state.status}`;
  const phase = (operationId: string, next: 'recording' | 'transcribing' | 'confirming' | 'idle') => onAction({ type: 'audioPhase', operationId, phase: next });

  function release(current: Capture) {
    clearTimeout(current.timer);
    for (const track of current.stream.getTracks()) track.stop();
    current.chunks = [];
    if (capture.current === current) capture.current = null;
    setAudioActivity('idle');
  }
  // A new attempt or unmount abandons local capture and ignores late transcription results.
  useEffect(() => () => {
    const current = capture.current;
    if (current) { current.cancelled = true; if (current.recorder.state !== 'inactive') current.recorder.stop(); release(current); }
    upload.current?.abort(); void finishConfirmation().catch(() => undefined); // the server's confirming pause must end, or the next turn is AUDIO_BUSY
  }, [attempt]);

  async function start() {
    const mimeType = supportedMime();
    if (!mimeType) { setStatus('unsupported'); setMessage('This browser cannot record audio here. Type your request instead.'); return; }
    setStatus('starting'); setMessage(''); pendingStop.current = false;
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      setStatus(denied ? 'denied' : 'error');
      setMessage(denied ? 'Microphone access was blocked. Allow it in the browser, or type your request instead.' : 'No microphone could be opened. Re-record or type instead.');
      return;
    }
    const operationId = crypto.randomUUID();
    await interruptPlayback(); // barge-in: the server must see the speech operation end first
    try { await phase(operationId, 'recording'); } catch {
      for (const track of stream.getTracks()) track.stop();
      setStatus('error'); setMessage('Recording is unavailable while other audio is active. Try again in a moment.');
      return;
    }
    const recorder = new MediaRecorder(stream, { mimeType });
    const current: Capture = { operationId, recorder, stream, chunks: [], bytes: 0, cancelled: false, timer: setTimeout(() => stop(), MAX_MS) };
    capture.current = current;
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      current.chunks.push(event.data); current.bytes += event.data.size;
      if (current.bytes >= MAX_BYTES && recorder.state !== 'inactive') recorder.stop();
    };
    recorder.onstop = () => void finish(current, mimeType);
    recorder.start(1000);
    setAudioActivity('recording');
    setStatus('recording');
    if (pendingStop.current) stop();
  }

  function down(event: PointerEvent<HTMLButtonElement>) {
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* release still reaches the button in practice */ }
    const started = !capture.current;
    press.current = { at: Date.now(), started };
    if (started) void start();
  }
  function up() {
    const current = press.current; press.current = null;
    if (!current) return;
    if (!current.started) return stop(); // tap while recording
    if (Date.now() - current.at >= HOLD_MS) { pendingStop.current = true; stop(); }
  }

  function stop() {
    const current = capture.current;
    if (current && current.recorder.state !== 'inactive') current.recorder.stop();
  }
  function cancel() {
    const current = capture.current;
    if (!current) return;
    current.cancelled = true;
    if (current.recorder.state !== 'inactive') current.recorder.stop(); else void finish(current, '');
  }

  async function finish(current: Capture, mimeType: string) {
    const clip = current.bytes <= MAX_BYTES ? new Blob(current.chunks, { type: mimeType }) : null;
    release(current);
    if (current.cancelled || !clip?.size) {
      await phase(current.operationId, 'idle').catch(() => undefined);
      setStatus('idle'); setMessage(current.cancelled ? '' : 'Nothing was recorded. Try again.');
      return;
    }
    setStatus('transcribing');
    const controller = new AbortController(); upload.current = controller;
    try {
      await phase(current.operationId, 'transcribing');
      const result = await uploadClip(state.sessionId, clip, current.operationId, controller.signal);
      if (!controller.signal.aborted) await phase(current.operationId, 'confirming');
      if (controller.signal.aborted) { void phase(current.operationId, 'idle').catch(() => undefined); return; }
      setConfirmation(() => phase(current.operationId, 'idle'));
      onTranscript(result);
      setStatus('idle');
    } catch (error) {
      const idle = phase(current.operationId, 'idle').catch(() => undefined);
      if (controller.signal.aborted) return;
      await idle;
      if (error instanceof AudioApiError && error.code === 'ATTEMPT_ABANDONED') { setStatus('idle'); return; }
      setStatus('error');
      setMessage(error instanceof AudioApiError && error.code === 'EMPTY_TRANSCRIPT' ? `No ${language} was heard. Re-record closer to the microphone, or type instead.` : 'The recording could not be transcribed. Re-record or type instead.');
    } finally { if (upload.current === controller) upload.current = null; }
  }

  const recording = status === 'recording';
  const busy = status === 'starting' || status === 'transcribing';
  const blocked = state.status !== 'active';
  const problem = status === 'error' || status === 'denied' || status === 'unsupported';
  return (
    <div className="voice-control" data-testid="recorder">
      <span className="mic-symbol" aria-hidden="true">{recording ? '●' : '◉'}</span>
      <div>
        <strong>{recording ? 'Listening…' : status === 'transcribing' ? 'Got it…' : 'Hold to talk'}</strong>
        <p>{recording ? 'Release or tap Stop when you finish.' : activity === 'playing' ? 'Tap to interrupt and speak.' : `Speak ${language}. Hold the button, or tap to start and stop.`}</p>
      </div>
      <button type="button" onPointerDown={down} onPointerUp={up} onPointerCancel={up} disabled={!recording && (busy || blocked || status === 'unsupported')}
        onKeyDown={(event) => { if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return; event.preventDefault(); if (recording) stop(); else if (!busy) void start(); }}>
        {recording ? 'Stop recording' : problem && status !== 'unsupported' ? 'Re-record' : 'Start recording'}
      </button>
      {recording && <button type="button" onClick={cancel}>Cancel</button>}
      {message && <p role="alert" className="recorder-message">{message}</p>}
      {problem && state.inputPreference === 'voice' && <button type="button" onClick={() => void onAction({ type: 'setInputPreference', preference: 'typed-accessibility' }).catch(() => undefined)}>Type instead</button>}
    </div>
  );
}
