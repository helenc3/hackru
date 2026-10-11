import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { NpcIdSchema, sceneManifest, type GameAction } from '@vibequest/shared';
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
import { WorldInteractions } from '../ui/WorldInteractions';
import { useApiHealth } from './use-api-health';
import { useSession } from './use-session';
import './game.css';

const ValidationHarness = import.meta.env.DEV && import.meta.env.VITE_ENABLE_VALIDATION_HARNESS === 'true'
  ? lazy(() => import('../validation/ValidationHarness').then((module) => ({ default: module.ValidationHarness }))) : null;
const validationRequested = window.location.pathname === '/__validation';

export function App() {
  const { health, healthProblem, retryHealth } = useApiHealth();
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
    {healthProblem && <aside role="alert" className="recovery-panel">{healthProblem}<button className="button secondary" onClick={retryHealth}>Retry API connection</button></aside>}
  </>;

  if (!session.state) {
    if (health?.segments?.engine === 'unimplemented' && !validationRequested) return <BootstrapPreview>{starter}</BootstrapPreview>;
    return <main className="welcome-screen"><a className="brand" href="/">VibeQuest<span className="brand-dot">.</span></a><span className="language-chip"><span lang="zh-Hans">中文</span>Mandarin Chinese</span><h1>Every street has a story.</h1>{starter}<p className="welcome-footer">One neighborhood. Three missions. Mandarin leads the way.</p></main>;
  }

  const state = session.state;
  const selectedCue = state.visibleCues.find((cue) => cue.id === sign);
  const here = state.interactables.find((entry) => entry.id === npc)?.position;
  const npcChoices = here ? state.interactables.filter((item) => item.kind === 'choice' && Math.hypot(item.position.x - here.x, item.position.z - here.z) <= sceneManifest.interactionRadius) : [];

  return <div className="game-shell" data-testid="game-shell" data-dialogue-open={Boolean(npc)}>
    <header className="game-topbar"><a className="brand" href="#world">VibeQuest<span className="brand-dot">.</span></a><span className="language-chip"><span lang="zh-Hans">中文</span>Mandarin Chinese</span><span>{state.mode === 'boss' ? 'Boss mission' : 'Practice'} · {state.zoneId}</span>{state.validationMode ? <span className="environment-banner">Developer validation · all XP, loot and badges are simulated. Progress stays separate from player sessions.</span> : state.providerStatus !== 'live' ? <span className="environment-banner">{state.providerStatus === 'fixture' ? 'Fixture demonstration · scripted responses' : 'Voice or AI service is degraded · retry or use the same-world fallback.'}</span> : null}{state.status === 'active' && <button className="button secondary" disabled={session.pending && !session.turnPending} onClick={() => void onAction({ type: 'retryMission' }).catch(() => undefined)}>Restart mission</button>}<button className="button secondary" disabled={session.pending} onClick={() => { closeConversation(); session.abandon(); }}>Leave session</button></header>
    <main className="game-main">
      <div className="game-world" id="world"><WorldRenderer key={attempt} state={state} onAction={onAction} onTalk={onTalk} /></div>
      <QuestPanel state={state} />
      <div className="hud-bottom-left">
        <WorldInteractions state={state} pending={session.pending} onAction={onAction} onTalk={onTalk} onShowSubtitles={setSign} />
        <InventoryBar state={state} pending={session.pending} paused={paused} onAction={onAction} onPause={() => void onAction({ type: paused ? 'resumePractice' : 'pausePractice' }).catch(() => undefined)} />
      </div>
      <AudioController state={state} onAction={onAction} speechId={session.turn?.speechId} />
      {selectedCue?.text && <section className="sign-overlay" role="dialog" aria-label="Inspected sign"><button ref={signClose} className="button secondary" onClick={closeSignPanel} aria-label="Close sign">Close</button><h3 lang="zh-Hans">{selectedCue.label}</h3><p lang="zh-Hans">{selectedCue.text}</p></section>}
      <RecoveryPanel problem={session.problem} pending={session.pending} onRetry={session.retry} onRefresh={session.refresh} onNew={session.abandon} onDismiss={session.dismiss} />
      {notice && <div className="action-notice" role="status">{notice}</div>}
      {session.events.length > 0 && <section className="event-feed" aria-label="Mission updates" aria-live="polite">{session.events.slice(-3).map((event) => <p key={event.id}>{event.message}</p>)}</section>}
      {paused && !npc && state.status === 'active' && <CoachPanel state={state} turn={session.turn} />}
      {npc && state.status === 'active' && <DialoguePanel key={`${state.sessionId}:${state.missionId}:${npc}`} state={state} npcId={npc} pending={session.pending} turn={session.turnNpc === npc ? session.turn : null} choices={npcChoices} onAction={onAction} onSubmit={session.submit} onLiveTurn={session.applyTurn} onClose={closeConversation} />}
      <ResultPanel state={state} pending={session.pending} onAction={onAction} onExit={session.abandon} />
      {validation && state.validationMode && ValidationHarness && <Suspense fallback={<p>Loading internal validator…</p>}><ValidationHarness state={state} onAction={onAction} onTalk={onTalk} /></Suspense>}
      <footer className="session-footer">{state.validationMode ? 'Validation session' : 'Player session'} · {state.sessionId} · Version {state.version}<button className="button secondary" disabled={session.pending} onClick={() => void session.refresh().catch(() => undefined)}>Refresh session</button></footer>
    </main>
  </div>;
}
