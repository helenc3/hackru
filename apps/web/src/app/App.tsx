import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { CueIdSchema, NpcIdSchema, sceneManifest, type GameAction } from '@vibequest/shared';
import { WorldRenderer } from '../world/WorldRenderer';
import { AudioController } from '../audio/AudioController';
import { StartPanel } from '../ui/StartPanel';
import { DialoguePanel } from '../ui/DialoguePanel';
import { QuestPanel } from '../ui/QuestPanel';
import { InventoryBar } from '../ui/InventoryBar';
import { ResultPanel } from '../ui/ResultPanel';
import { RecoveryPanel } from '../ui/RecoveryPanel';
import { CoachPanel } from '../ui/CoachPanel';
import { BootstrapPreview } from './BootstrapPreview';
import { useSession } from './use-session';
import './game.css';

const ValidationHarness = import.meta.env.DEV && import.meta.env.VITE_ENABLE_VALIDATION_HARNESS === 'true'
  ? lazy(() => import('../validation/ValidationHarness').then((module) => ({ default: module.ValidationHarness }))) : null;
const validationRequested = window.location.pathname === '/__validation';
type Health = { buildId: string; providers: { geminiConfigured: boolean; elevenlabsConfigured: boolean }; features: { fixtures: boolean; validationHarness: boolean }; segments?: { engine?: string } };

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthProblem, setHealthProblem] = useState('');
  const [healthRefresh, setHealthRefresh] = useState(0);
  const validation = Boolean(ValidationHarness && validationRequested && health?.features.validationHarness);
  const session = useSession(validationRequested);
  const [npc, setNpc] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [sign, setSign] = useState<string | null>(null);
  const signClose = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState('');
  // The server resets position on a new attempt; remounting the world resets the client avatar to match.
  const [attempt, setAttempt] = useState(0);
  const closeSignPanel = useCallback(() => {
    setSign(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="world-renderer"]')?.focus());
  }, []);
  useEffect(() => {
    if (!sign) return;
    signClose.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); closeSignPanel(); }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [sign, closeSignPanel]);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    void fetch('/api/health', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('The API is unavailable.');
      const body = await response.json() as Partial<Health>;
      if (!body.features || typeof body.features.fixtures !== 'boolean' || typeof body.features.validationHarness !== 'boolean' || !body.providers || typeof body.providers.geminiConfigured !== 'boolean' || typeof body.providers.elevenlabsConfigured !== 'boolean') throw new Error('The API health response is invalid.');
      setHealth(body as Health); setHealthProblem('');
    }).catch(() => { if (disposed) return; if (!controller.signal.aborted) setHealthProblem('The API could not be reached.'); else setHealthProblem('The API check timed out.'); }).finally(() => clearTimeout(timeout));
    return () => { disposed = true; controller.abort(); clearTimeout(timeout); };
  }, [healthRefresh]);

  useEffect(() => { setNpc(null); setSign(null); setPaused(false); setNotice(''); }, [session.state?.sessionId, session.state?.missionId, session.state?.status]);
  const closeConversation = useCallback(() => setNpc(null), []);

  const onAction = useCallback(async (action: GameAction) => {
    try {
      await session.onAction(action);
      if (action.type === 'retryMission' || action.type === 'startMission') { setNpc(null); setSign(null); setAttempt((count) => count + 1); }
      if (action.type === 'inspect') setSign(action.targetId);
      if (action.type === 'pausePractice') setPaused(true);
      if (action.type === 'resumePractice' || action.type === 'retryMission' || action.type === 'startMission') setPaused(false);
      setNotice('');
    } catch (error: unknown) { setNotice(error instanceof Error ? error.message : 'The action could not be completed.'); throw error; }
  }, [session.onAction]);

  const onTalk = useCallback((id: string) => {
    const parsed = NpcIdSchema.safeParse(id);
    if (parsed.success && session.state?.status === 'active' && session.state.interactables.some((item) => item.id === id && item.kind === 'npc')) { setNpc(parsed.data); setSign(null); }
  }, [session.state]);

  if (validationRequested && health && !validation) return <main className="validation-denied"><h1>Internal validation is unavailable.</h1><p>This entry requires a development build and server validation configuration.</p><a href="/">Return to the game</a></main>;
  const starter = <><StartPanel validation={validation} fixtures={health?.features.fixtures ?? false} pending={session.pending || !health || validationRequested && !validation} resumeId={session.resumeId} onStart={session.start} onContinue={session.refresh} />
    <RecoveryPanel problem={session.problem} pending={session.pending} onRetry={session.retry} onRefresh={session.refresh} onNew={session.abandon} onDismiss={session.dismiss} />
    {healthProblem && <aside role="alert" className="recovery-panel">{healthProblem}<button className="button secondary" onClick={() => setHealthRefresh((count) => count + 1)}>Retry API connection</button></aside>}
  </>;

  if (!session.state) {
    if (health?.segments?.engine === 'unimplemented' && !validationRequested) return <BootstrapPreview>{starter}</BootstrapPreview>;
    return <main className="welcome-screen"><a className="brand" href="/">VibeQuest<span className="brand-dot">.</span></a><span className="language-chip"><span lang="zh-Hans">中文</span>Mandarin Chinese</span><h1>Every street has a story.</h1>{starter}<p className="welcome-footer">One neighborhood. Three missions. Mandarin leads the way.</p></main>;
  }

  const state = session.state;
  const selectedCue = state.visibleCues.find((cue) => cue.id === sign);
  const available = state.interactables.filter((item) => sceneManifest.interactables.find((target) => target.id === item.id)?.zoneId === state.zoneId);
  // These affordances reflect server-published interactions. The server owns proximity and guards.
  const choices = available.filter((item) => item.kind === 'choice');
  const signs = available.filter((item) => item.kind === 'sign');
  const broadcasts = available.filter((item) => item.kind === 'pa');
  const speakers = available.filter((item) => item.kind === 'npc');

  return <div className="game-shell" data-testid="game-shell" data-dialogue-open={Boolean(npc)}>
    <header className="game-topbar"><a className="brand" href="#world">VibeQuest<span className="brand-dot">.</span></a><span className="language-chip"><span lang="zh-Hans">中文</span>Mandarin Chinese</span><span>{state.mode === 'boss' ? 'Boss mission' : 'Practice'} · {state.zoneId}</span>{state.status === 'active' && <button className="button secondary" disabled={session.pending && !session.turnPending} onClick={() => void onAction({ type: 'retryMission' }).catch(() => undefined)}>Restart mission</button>}<button className="button secondary" disabled={session.pending} onClick={() => { closeConversation(); session.abandon(); }}>Leave session</button></header>
    {state.validationMode ? <div className="environment-banner">Developer validation · all XP, loot and badges are simulated. Progress stays separate from player sessions.</div> : state.providerStatus !== 'live' ? <div className="environment-banner">{state.providerStatus === 'fixture' ? 'Fixture demonstration · scripted responses' : 'Voice or AI service is degraded · retry or use the same-world fallback.'}</div> : null}
    <main className="game-main"><div className="game-layout"><div className="game-world" id="world"><WorldRenderer key={attempt} state={state} onAction={onAction} onTalk={onTalk} />
      <InventoryBar state={state} pending={session.pending} paused={paused} onAction={onAction} onPause={() => void onAction({ type: paused ? 'resumePractice' : 'pausePractice' }).catch(() => undefined)} />
      {selectedCue?.text && <section className="sign-overlay" role="dialog" aria-label="Inspected sign"><button ref={signClose} className="button secondary" onClick={closeSignPanel} aria-label="Close sign">Close</button><h3 lang="zh-Hans">{selectedCue.label}</h3><p lang="zh-Hans">{selectedCue.text}</p></section>}
      <AudioController state={state} onAction={onAction} speechId={session.turn?.speechId} />
      <section className="interaction-dock" aria-label="World interactions"><h2>Look, listen, speak, act.</h2><p>Approach an interaction in the world. The server checks your location and mission prerequisites.</p><div>
        {speakers.map((item) => <button className="button secondary" key={item.id} disabled={session.pending || state.status !== 'active'} onClick={() => onTalk(item.id)}><span lang="zh-Hans">{item.label}</span> · Talk</button>)}
        {signs.map((item) => <button className="button secondary" key={item.id} disabled={session.pending || state.status !== 'active'} onClick={() => void onAction({ type: 'inspect', targetId: item.id }).catch(() => undefined)}><span lang="zh-Hans">{item.label}</span> · Read sign</button>)}
        {broadcasts.map((item) => <div className="cue-actions" key={item.id}><span lang="zh-Hans">{item.label}</span><button className="button secondary" disabled={session.pending || state.status !== 'active'} onClick={() => void onAction({ type: 'playCue', cueId: CueIdSchema.parse(item.id), channel: 'audio' }).catch(() => undefined)}>Listen</button><button className="button secondary" disabled={session.pending || state.status !== 'active'} onClick={() => void onAction({ type: 'playCue', cueId: CueIdSchema.parse(item.id), channel: 'subtitles' }).then(() => setSign(item.id)).catch(() => undefined)}>Chinese subtitles</button></div>)}
      </div></section>
      {state.status === 'active' && <section className="choice-dock" aria-label="Mission actions">{choices.map((item) => <button className="button secondary" key={item.id} disabled={session.pending} onClick={() => void onAction({ type: 'choose', choiceId: item.id as Extract<GameAction, { type: 'choose' }>['choiceId'] }).catch(() => undefined)} lang="zh-Hans">{item.label}</button>)}</section>}
    </div><QuestPanel state={state} /></div>
    <RecoveryPanel problem={session.problem} pending={session.pending} onRetry={session.retry} onRefresh={session.refresh} onNew={session.abandon} onDismiss={session.dismiss} />
    {notice && <div className="action-notice" role="status">{notice}</div>}
    {session.events.length > 0 && <section className="event-feed" aria-label="Mission updates" aria-live="polite">{session.events.slice(-3).map((event) => <p key={event.id}>{event.message}</p>)}</section>}
    {paused && !npc && state.status === 'active' && <CoachPanel state={state} turn={session.turn} />}
    {npc && state.status === 'active' && <DialoguePanel key={`${state.sessionId}:${state.missionId}:${npc}`} state={state} npcId={npc} pending={session.pending} turn={session.turnNpc === npc ? session.turn : null} onAction={onAction} onSubmit={session.submit} onClose={closeConversation} />}
    <ResultPanel state={state} pending={session.pending} onAction={onAction} onExit={session.abandon} />
    {validation && state.validationMode && ValidationHarness && <Suspense fallback={<p>Loading internal validator…</p>}><ValidationHarness state={state} onAction={onAction} onTalk={onTalk} /></Suspense>}
    <footer className="session-footer">{state.validationMode ? 'Validation session' : 'Player session'} · {state.sessionId} · Version {state.version}<button className="button secondary" disabled={session.pending} onClick={() => void session.refresh().catch(() => undefined)}>Refresh session</button></footer>
    </main>
  </div>;
}
