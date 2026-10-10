import { useState } from 'react';
import type { CreateSessionRequest } from '@vibequest/shared';

export function StartPanel({ validation, fixtures, pending, resumeId, onStart, onContinue }: {
  validation: boolean; fixtures: boolean; pending: boolean; resumeId: string | null;
  onStart: (options: CreateSessionRequest) => Promise<void>; onContinue: () => Promise<void>;
}) {
  const [tier, setTier] = useState<0 | 1>(0);
  const [provider, setProvider] = useState<'live' | 'fixture'>(validation ? 'fixture' : 'live');
  const [microphone, setMicrophone] = useState('Check your microphone before starting, or use typed Mandarin in the same conversation panel.');
  const [audio, setAudio] = useState('Audio has not been checked.');
  const [checking, setChecking] = useState(false);

  async function checkMicrophone() {
    setChecking(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access needs HTTPS or localhost and a supported browser.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicrophone('Microphone permission granted. You choose when recording starts.');
    } catch (error: unknown) {
      setMicrophone(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in your browser settings, or choose typed Mandarin in the same panel.' : error instanceof Error ? error.message : 'Microphone unavailable. Typed Mandarin remains available.');
    } finally { setChecking(false); }
  }

  async function checkAudio() {
    try {
      const context = new AudioContext();
      await context.resume();
      await context.close();
      setAudio('Browser audio is supported. Turn up your volume for Mandarin replies.');
    } catch { setAudio('Audio is unavailable. Chinese subtitles remain in the same conversation panel.'); }
  }

  return <section className="start-panel" aria-labelledby="start-title" data-testid="start-panel">
    <div><span className="eyebrow">YOUR MANDARIN ADVENTURE</span><h2 id="start-title">Find your way through conversation.</h2><p>Read the neighborhood, speak to the locals, and act on what you understand.</p></div>
    <fieldset disabled={pending}><legend>How much Mandarin have you used?</legend>
      <label><input type="radio" name="tier" checked={tier === 0} onChange={() => setTier(0)} />New learner</label>
      <label><input type="radio" name="tier" checked={tier === 1} onChange={() => setTier(1)} />Some Mandarin</label>
    </fieldset>
    {fixtures && !validation && <label className="field-label">Conversation provider<select aria-label="Conversation provider" value={provider} onChange={(event) => setProvider(event.target.value as 'live' | 'fixture')} disabled={pending}><option value="live">Live AI</option><option value="fixture">Fixture demonstration · scripted</option></select></label>}
    <div className="setup-row"><button className="button secondary" disabled={checking || pending} onClick={() => void checkMicrophone()}>Check microphone</button><p role="status">{microphone}</p></div>
    <div className="setup-row"><button className="button secondary" disabled={pending} onClick={() => void checkAudio()}>Check audio</button><p role="status">{audio}</p></div>
    <div className="start-actions"><button className="button primary" disabled={pending} onClick={() => void onStart({ initialTier: tier, providerMode: validation ? 'fixture' : provider, validationMode: validation, inputPreference: 'voice' }).catch(() => undefined)}>{pending ? 'Connecting…' : validation ? 'Start validation session' : 'Start Practice'}<span aria-hidden="true">↗</span></button>
      {resumeId && <button className="button secondary" disabled={pending} onClick={() => void onContinue().catch(() => undefined)}>Continue Session</button>}
    </div>
    {validation && <p className="environment-notice">Developer simulation. Progress cannot transfer to a player session.</p>}
  </section>;
}
