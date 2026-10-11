import { Button, RadioGroup, Select, Card } from './primitives';
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

  return <Card asChild><section className="start-panel" aria-labelledby="start-title" data-testid="start-panel">
    <div><span className="eyebrow">YOUR MANDARIN ADVENTURE</span><h2 id="start-title">Find your way through conversation.</h2><p>Read the neighborhood, speak to the locals, and act on what you understand.</p></div>
    <fieldset disabled={pending}><legend id="tier-label">How much Mandarin have you used?</legend>
      <RadioGroup.Root aria-labelledby="tier-label" name="tier" value={String(tier)} onValueChange={(value) => setTier(Number(value) as 0 | 1)} disabled={pending} className="learner-options">
        <RadioGroup.Item value="0">New learner</RadioGroup.Item><RadioGroup.Item value="1">Some Mandarin</RadioGroup.Item>
      </RadioGroup.Root>
    </fieldset>
    {fixtures && !validation && <div className="field-label"><label id="provider-label">Conversation provider</label><Select.Root value={provider} onValueChange={(value) => setProvider(value as 'live' | 'fixture')} disabled={pending}><Select.Trigger aria-labelledby="provider-label" /><Select.Content><Select.Item value="live">Live AI</Select.Item><Select.Item value="fixture">Fixture demonstration · scripted</Select.Item></Select.Content></Select.Root></div>}
    <div className="setup-row"><Button className="button secondary" disabled={checking || pending} onClick={() => void checkMicrophone()}>Check microphone</Button><p role="status">{microphone}</p></div>
    {recordingUrl && <audio ref={microphonePlayer} controls autoPlay src={recordingUrl} aria-label="Your microphone test recording" />}
    <audio ref={audioPlayer} src="/audio/rutgers-university-zh.mp3" preload="auto" onError={() => setAudio('The audio check clip could not load. Please reload and try again.')} />
    <div className="setup-row"><Button className="button secondary" disabled={checking || pending} onClick={() => void checkAudio()}>Check audio</Button><p role="status">{audio}</p></div>
    <div className="start-actions"><Button className="button primary" disabled={pending} onClick={() => void onStart({ initialTier: tier, providerMode: validation ? 'fixture' : provider, validationMode: validation, inputPreference: 'voice' }).catch(() => undefined)}>{pending ? 'Connecting…' : validation ? 'Start validation session' : 'Start Practice'}<span aria-hidden="true">↗</span></Button>
      {resumeId && <Button className="button secondary" disabled={pending} onClick={() => void onContinue().catch(() => undefined)}>Continue Session</Button>}
    </div>
    {validation && <p className="environment-notice">Developer simulation. Progress cannot transfer to a player session.</p>}
  </section></Card>;
}
