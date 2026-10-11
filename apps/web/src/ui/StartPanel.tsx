import { useState } from 'react';
import { useDeviceCheck } from '../audio/use-device-check';
import type { CreateSessionRequest } from '@vibequest/shared';

export function StartPanel({ validation, fixtures, pending, resumeId, onStart, onContinue }: {
  validation: boolean; fixtures: boolean; pending: boolean; resumeId: string | null;
  onStart: (options: CreateSessionRequest) => Promise<void>; onContinue: () => Promise<void>;
}) {
  const [tier, setTier] = useState<0 | 1>(0);
  const [provider, setProvider] = useState<'live' | 'fixture'>(validation ? 'fixture' : 'live');
  const { microphone, audio, checking, recordingUrl, microphonePlayer, audioPlayer, checkMicrophone, checkAudio, setAudio } = useDeviceCheck();

  return <section className="start-panel" aria-labelledby="start-title" data-testid="start-panel">
    <div><span className="eyebrow">YOUR MANDARIN ADVENTURE</span><h2 id="start-title">Find your way through conversation.</h2><p>Read the neighborhood, speak to the locals, and act on what you understand.</p></div>
    <fieldset disabled={pending}><legend>How much Mandarin have you used?</legend>
      <label><input type="radio" name="tier" checked={tier === 0} onChange={() => setTier(0)} />New learner</label>
      <label><input type="radio" name="tier" checked={tier === 1} onChange={() => setTier(1)} />Some Mandarin</label>
    </fieldset>
    {fixtures && !validation && <label className="field-label">Conversation provider<select aria-label="Conversation provider" value={provider} onChange={(event) => setProvider(event.target.value as 'live' | 'fixture')} disabled={pending}><option value="live">Live AI</option><option value="fixture">Fixture demonstration · scripted</option></select></label>}
    <div className="setup-row"><button className="button secondary" disabled={checking || pending} onClick={() => void checkMicrophone()}>Check microphone</button><p role="status">{microphone}</p></div>
    {recordingUrl && <audio ref={microphonePlayer} controls autoPlay src={recordingUrl} aria-label="Your microphone test recording" />}
    <audio ref={audioPlayer} src="/audio/rutgers-university-zh.mp3" preload="auto" onError={() => setAudio('The audio check clip could not load. Please reload and try again.')} />
    <div className="setup-row"><button className="button secondary" disabled={checking || pending} onClick={() => void checkAudio()}>Check audio</button><p role="status">{audio}</p></div>
    <div className="start-actions"><button className="button primary" disabled={pending} onClick={() => void onStart({ initialTier: tier, providerMode: validation ? 'fixture' : provider, validationMode: validation, inputPreference: 'voice' }).catch(() => undefined)}>{pending ? 'Connecting…' : validation ? 'Start validation session' : 'Start Practice'}<span aria-hidden="true">↗</span></button>
      {resumeId && <button className="button secondary" disabled={pending} onClick={() => void onContinue().catch(() => undefined)}>Continue Session</button>}
    </div>
    {validation && <p className="environment-notice">Developer simulation. Progress cannot transfer to a player session.</p>}
  </section>;
}
