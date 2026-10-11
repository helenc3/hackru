import { Button, GameDialog, Dialog } from '../ui/primitives';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { NpcIdSchema, type GameAction } from '@vibequest/shared';
import { WorldRenderer } from '../world/WorldRenderer';
import { AudioController } from '../audio/AudioController';
import { BackgroundMusic } from '../audio/BackgroundMusic';
import { StartPanel } from '../ui/StartPanel';
import { DialoguePanel } from '../ui/DialoguePanel';
import { QuestPanel } from '../ui/QuestPanel';
import { GameMenus } from '../ui/GameMenus';
import { InventoryBar } from '../ui/InventoryBar';
import { ResultPanel } from '../ui/ResultPanel';
import { RecoveryPanel } from '../ui/RecoveryPanel';
import { CoachPanel } from '../ui/CoachPanel';
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
  const [notice, setNotice] = useState('');
  // The server resets position on a new attempt; remounting the world resets the client avatar to match.
  const [attempt, setAttempt] = useState(0);
  const closeSignPanel = useCallback(() => {
    setSign(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="world-renderer"]')?.focus());
  }, []);



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
    {healthProblem && <aside role="alert" className="recovery-panel">{healthProblem}<Button className="button secondary" onClick={retryHealth}>Retry API connection</Button></aside>}
  </>;

  if (!session.state) {
    return <main className="welcome-screen"><a className="brand" href="/">VibeQuest</a><span className="language-chip"><span lang="zh-Hans">中文</span>Mandarin Chinese</span><h1>Every street has a story.</h1>{starter}<p className="welcome-footer">One neighborhood. Three missions. Mandarin leads the way.</p></main>;
  }

  const state = session.state;
  const selectedCue = state.visibleCues.find((cue) => cue.id === sign);

  return <div className="game-shell" data-testid="game-shell" data-dialogue-open={Boolean(npc)}>
    <header className="game-topbar"><a className="brand" href="#world">VibeQuest</a><QuestPanel state={state} /><div className="topbar-tools"><GameMenus key={state.sessionId} pending={session.pending} restartPending={session.pending && !session.turnPending} active={state.status === 'active'} onRestart={() => void onAction({ type: 'retryMission' }).catch(() => undefined)} onLeave={() => { closeConversation(); session.abandon(); }} onRefresh={() => void session.refresh().catch(() => undefined)} /><InventoryBar state={state} pending={session.pending} paused={paused} onAction={onAction} onPause={() => void onAction({ type: paused ? 'resumePractice' : 'pausePractice' }).catch(() => undefined)} /></div></header>
    {state.validationMode ? <div className="environment-banner">Developer validation · all XP, loot and badges are simulated. Progress stays separate from player sessions.</div> : state.providerStatus !== 'live' ? <div className="environment-banner">{state.providerStatus === 'fixture' ? 'Fixture demonstration · scripted responses' : 'Voice or AI service is degraded · retry or use the same-world fallback.'}</div> : null}
    <main className="game-main"><div className="game-layout"><div className="game-world" id="world"><WorldRenderer key={attempt} state={state} onAction={onAction} onTalk={onTalk} />
      {selectedCue?.text && <GameDialog label="Inspected sign" onClose={closeSignPanel}><section className="sign-overlay" role="dialog" aria-label="Inspected sign"><Button className="button secondary" onClick={closeSignPanel} aria-label="Close sign">Close</Button><Dialog.Title asChild><h3 lang="zh-Hans">{selectedCue.label}</h3></Dialog.Title><p lang="zh-Hans">{selectedCue.text}</p></section></GameDialog>}
      <AudioController state={state} onAction={onAction} speechId={session.turn?.speechId} />
      {!state.validationMode && <BackgroundMusic active={state.status === 'active' && !paused} conversation={Boolean(npc)} />}
      <WorldInteractions state={state} pending={session.pending} onAction={onAction} onTalk={onTalk} onShowSubtitles={setSign} />
    </div></div>
    <RecoveryPanel problem={session.problem} pending={session.pending} onRetry={session.retry} onRefresh={session.refresh} onNew={session.abandon} onDismiss={session.dismiss} />
    {notice && <div className="action-notice" role="status">{notice}</div>}
    {paused && !npc && state.status === 'active' && <CoachPanel state={state} turn={session.turn} />}
    {npc && state.status === 'active' && <DialoguePanel key={`${state.sessionId}:${state.missionId}:${npc}`} state={state} npcId={npc} pending={session.pending} turn={session.turnNpc === npc ? session.turn : null} onAction={onAction} onSubmit={session.submit} onClose={closeConversation} />}
    <ResultPanel state={state} pending={session.pending} onAction={onAction} onExit={session.abandon} />
    {validation && state.validationMode && ValidationHarness && <Suspense fallback={<p>Loading internal validator…</p>}><ValidationHarness state={state} onAction={onAction} onTalk={onTalk} /></Suspense>}

    </main>
  </div>;
}
