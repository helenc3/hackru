import { useEffect, useRef, useState } from 'react';
import type { RecorderProps } from '@vibequest/shared';
import { AudioApiError, setAudioActivity, setConfirmation, uploadClip, useAudioActivity } from './audio-bus';

const MAX_MS = 15_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];

type Status = 'idle' | 'starting' | 'recording' | 'transcribing' | 'error' | 'denied' | 'unsupported';
type Capture = { operationId: string; recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; bytes: number; cancelled: boolean; timer: ReturnType<typeof setTimeout> };

function supportedMime(): string | null {
  if (typeof window.MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/** User-activated push-to-record. Transcripts are proposals: only the panel's Send creates a turn. */
export function Recorder({ state, onAction, onTranscript }: RecorderProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const capture = useRef<Capture | null>(null);
  const upload = useRef<AbortController | null>(null);
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
    upload.current?.abort(); setConfirmation(null);
  }, [attempt]);

  async function start() {
    const mimeType = supportedMime();
    if (!mimeType) { setStatus('unsupported'); setMessage('This browser cannot record audio here. Type your Mandarin instead.'); return; }
    setStatus('starting'); setMessage('');
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      setStatus(denied ? 'denied' : 'error');
      setMessage(denied ? 'Microphone access was blocked. Allow it in the browser, or type your Mandarin instead.' : 'No microphone could be opened. Re-record or type instead.');
      return;
    }
    const operationId = crypto.randomUUID();
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
      if (controller.signal.aborted) return;
      await phase(current.operationId, 'confirming');
      setConfirmation(() => phase(current.operationId, 'idle'));
      onTranscript(result);
      setStatus('idle');
    } catch (error) {
      if (controller.signal.aborted) return;
      await phase(current.operationId, 'idle').catch(() => undefined);
      if (error instanceof AudioApiError && error.code === 'ATTEMPT_ABANDONED') { setStatus('idle'); return; }
      setStatus('error');
      setMessage(error instanceof AudioApiError && error.code === 'EMPTY_TRANSCRIPT' ? 'No Mandarin was heard. Re-record closer to the microphone, or type instead.' : 'The recording could not be transcribed. Re-record or type instead.');
    } finally { if (upload.current === controller) upload.current = null; }
  }

  const recording = status === 'recording';
  const busy = status === 'starting' || status === 'transcribing';
  const blocked = activity === 'playing' || state.status !== 'active';
  const problem = status === 'error' || status === 'denied' || status === 'unsupported';
  return (
    <div className="voice-control" data-testid="recorder">
      <span className="mic-symbol" aria-hidden="true">{recording ? '●' : '◉'}</span>
      <div>
        <strong>{recording ? 'Listening… speak Mandarin' : status === 'transcribing' ? 'Transcribing…' : 'Speak Mandarin'}</strong>
        <p>{recording ? 'Up to 15 seconds. Stop when you finish.' : blocked && activity === 'playing' ? 'Wait for the reply audio to finish.' : 'Record, check the transcript, then Send.'}</p>
      </div>
      {recording
        ? <><button type="button" onClick={stop}>Stop recording</button><button type="button" onClick={cancel}>Cancel</button></>
        : <button type="button" onClick={() => void start()} disabled={busy || blocked || status === 'unsupported'}>{problem && status !== 'unsupported' ? 'Re-record' : 'Start recording'}</button>}
      {message && <p role="alert" className="recorder-message">{message}</p>}
      {problem && state.inputPreference === 'voice' && <button type="button" onClick={() => void onAction({ type: 'setInputPreference', preference: 'typed-accessibility' }).catch(() => undefined)}>Type instead</button>}
    </div>
  );
}
