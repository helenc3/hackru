import { useState } from 'react';
import { useDeviceCheck } from '../audio/use-device-check';
import type { CreateSessionRequest, GameLanguage } from '@vibequest/shared';

export function StartPanel({ validation, fixtures, pending, resumeId, onStart, onContinue }: {
  validation: boolean; fixtures: boolean; pending: boolean; resumeId: string | null;
  onStart: (options: CreateSessionRequest) => Promise<void>; onContinue: () => Promise<void>;
}) {
  const [language, setLanguage] = useState<GameLanguage>('zh');
  const [provider, setProvider] = useState<'live' | 'fixture'>(validation ? 'fixture' : 'live');
  const { microphone, audio, checking, recordingUrl, microphonePlayer, audioPlayer, checkMicrophone, checkAudio, setAudio } = useDeviceCheck();

  return <section className="start-panel" aria-labelledby="start-title" data-testid="start-panel">
    <div><h2 id="start-title">Explore Shanghai in {language === 'en' ? 'English' : 'Mandarin'}.</h2></div>
    <div className="intro-columns"><div className="intro-setup">
    {fixtures && !validation && <label className="field-label">Conversation provider<select aria-label="Conversation provider" value={provider} onChange={(event) => setProvider(event.target.value as 'live' | 'fixture')} disabled={pending}><option value="live">Live AI</option><option value="fixture">Fixture demonstration · scripted</option></select></label>}
    <label className="field-label">Conversation language<select aria-label="Conversation language" value={language} onChange={(event) => setLanguage(event.target.value as GameLanguage)} disabled={pending}><option value="zh">中文 — Mandarin</option><option value="en">English — Testing</option></select></label>
    <div className="setup-row"><button className="button secondary" disabled={checking || pending} onClick={() => void checkMicrophone()}>Check microphone</button><p role="status">{language === 'en' ? microphone.replaceAll('Mandarin', 'English') : microphone}</p></div>
    {recordingUrl && <audio ref={microphonePlayer} controls autoPlay src={recordingUrl} aria-label="Your microphone test recording" />}
    <audio ref={audioPlayer} src="/audio/rutgers-university-zh.mp3" preload="auto" onError={() => setAudio('The audio check clip could not load. Please reload and try again.')} />
    <div className="setup-row"><button className="button secondary" disabled={checking || pending} onClick={() => void checkAudio()}>Check audio</button><p role="status">{audio}</p></div>
    </div><section className="intro-controls" aria-labelledby="intro-controls-title"><h3 id="intro-controls-title">Controls</h3><p>Explore the streets and follow your current quest.</p>
      <dl className="controls-list"><dt>WASD / Arrow keys</dt><dd>Walk</dd><dt>Click the world</dt><dd>Walk there</dd><dt>Drag sideways</dt><dd>Orbit the camera</dd><dt>Drag up / down</dt><dd>Tilt and zoom the camera</dd><dt>E</dt><dd>Interact with the nearest target</dd><dt>Esc</dt><dd>Close a conversation</dd></dl>
    </section></div>
    <div className="start-actions"><button className="button primary" disabled={pending} onClick={() => void onStart({ language, initialTier: 0, providerMode: validation ? 'fixture' : provider, validationMode: validation, inputPreference: 'voice' }).catch(() => undefined)}>{pending ? 'Connecting…' : validation ? 'Start validation session' : 'Start exploring'}<span aria-hidden="true">↗</span></button>
      {resumeId && <p className="environment-notice">Continue keeps your session’s original language.</p>}
      {resumeId && <button className="button secondary" disabled={pending} onClick={() => void onContinue().catch(() => undefined)}>Continue Session</button>}
    </div>
    {validation && <p className="environment-notice">Developer simulation. Progress cannot transfer to a player session.</p>}
  </section>;
}
