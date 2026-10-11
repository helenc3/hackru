import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createBaselineState, type GameAction, type MissionId, type PublicState, type TurnResponse } from '@vibequest/shared';
import { WorldRenderer } from '../world/WorldRenderer';
import { AudioController } from '../audio/AudioController';
import { BackgroundMusic } from '../audio/BackgroundMusic';
import { StartPanel } from '../ui/StartPanel';
import { DialoguePanel } from '../ui/DialoguePanel';
import { QuestPanel } from '../ui/QuestPanel';
import { ResultPanel } from '../ui/ResultPanel';
import { RecoveryPanel } from '../ui/RecoveryPanel';
import { ConversationCard, type ConversationSummary, type NpcTarget } from '../ui/ConversationCard';
import { DirectionsCard } from '../ui/DirectionsCard';
import { PhotoOverlay } from '../ui/PhotoOverlay';
import { GlossPopover } from '../dictionary/GlossPopover';
import { ReviewPanel } from '../dictionary/ReviewPanel';
import { useApiHealth } from './use-api-health';
import { useSession } from './use-session';
import { LookupPanel } from '../dictionary/LookupPanel';
import './game.css';

const ValidationHarness = import.meta.env.DEV && import.meta.env.VITE_ENABLE_VALIDATION_HARNESS === 'true'
  ? lazy(() => import('../validation/ValidationHarness').then((module) => ({ default: module.ValidationHarness }))) : null;
const validationRequested = window.location.pathname === '/__validation';
// The welcome screen floats over a blurred, non-interactive preview of the city so players see the world before entering.
const previewState = createBaselineState('Q1');
const previewAction = async () => undefined;
const previewTalk = () => undefined;

export function App() {
  const { health, healthProblem, retryHealth } = useApiHealth();
  const validation = Boolean(ValidationHarness && validationRequested && health?.features.validationHarness);
  const session = useSession(validationRequested);
  const [npc, setNpc] = useState<NpcTarget | null>(null);
  const [guidanceContainer, setGuidanceContainer] = useState<HTMLDivElement | null>(null);
  const [settingsRotation, setSettingsRotation] = useState(0);
  // The server resets position on a new attempt; remounting the world resets the client avatar to match.
  const [attempt, setAttempt] = useState(0);
  // Latest terminal result per mission, kept client-side for review; the server never re-sends an earlier debrief.
  const resultsKey = session.state ? `vibequest.mission-results.v1:${session.state.sessionId}` : null;
  const [results, setResults] = useState<Partial<Record<MissionId, PublicState>>>({});
  const [resultsClosed, setResultsClosed] = useState(false);
  const [review, setReview] = useState<MissionId | null>(null);
  useEffect(() => { try { setResults(resultsKey ? JSON.parse(localStorage.getItem(resultsKey) ?? '{}') : {}); } catch { setResults({}); } }, [resultsKey]);
  useEffect(() => {
    const terminal = session.state;
    if (!terminal || terminal.status === 'active' || !resultsKey) return;
    setResults((previous) => { const next = { ...previous, [terminal.missionId]: terminal }; try { localStorage.setItem(resultsKey, JSON.stringify(next)); } catch { /* storage optional */ } return next; });
  }, [session.state, resultsKey]);
  const closeResults = useCallback(() => {
    setResultsClosed(true); setReview(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="world-renderer"]')?.focus());
  }, []);
  const openReview = useCallback((missionId: MissionId) => { setNpc(null); setConversation(null); setReview(missionId); }, []);
  const leave = useCallback(() => { try { if (resultsKey) localStorage.removeItem(resultsKey); } catch { /* storage optional */ } setNpc(null); session.abandon(); }, [resultsKey, session.abandon]);
  useEffect(() => { setNpc(null); setResultsClosed(false); setReview(null); setConversation(null); }, [session.state?.sessionId, session.state?.missionId, session.state?.status]);
  const [conversation, setConversation] = useState<(ConversationSummary & { turn: TurnResponse | null }) | null>(null);
  const latestTurn = useRef(session.turn); latestTurn.current = session.turn;
  const closeConversation = useCallback((ended?: ConversationSummary) => {
    setNpc(null);
    if (ended) setConversation({ ...ended, turn: latestTurn.current });
    else requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="world-renderer"]')?.focus());
  }, []);
  const closeConversationCard = useCallback(() => {
    setConversation(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="world-renderer"]')?.focus());
  }, []);

  const onAction = useCallback(async (action: GameAction) => {
    await session.onAction(action);
    if (action.type === 'startMission') { setNpc(null); setAttempt((count) => count + 1); }
  }, [session.onAction]);

  const onTalk = useCallback((anchorId: string) => {
    const target = session.state?.status === 'active' ? session.state.interactables.find((item) => item.id === anchorId && item.kind === 'npc' && item.role) : undefined;
    if (target?.role) { setNpc({ anchorId, role: target.role, name: target.label }); setConversation(null); }
  }, [session.state]);

  if (validationRequested && health && !validation) return <main className="validation-denied"><h1>Internal validation is unavailable.</h1><p>This entry requires a development build and server validation configuration.</p><a href="/">Return to the game</a></main>;
  const starter = <><StartPanel validation={validation} fixtures={health?.features.fixtures ?? false} pending={session.pending || !health || validationRequested && !validation} resumeId={session.resumeId} onStart={session.start} onContinue={session.refresh} />
    <RecoveryPanel problem={session.problem} pending={session.pending} onRetry={session.retry} onRefresh={session.refresh} onNew={session.abandon} onDismiss={session.dismiss} />
    {healthProblem && <aside role="alert" className="recovery-panel">{healthProblem}<button className="button secondary" onClick={retryHealth}>Retry API connection</button></aside>}
  </>;

  if (!session.state) {
    return <div className="game-shell welcome-shell" data-testid="welcome-shell">
      <div className="game-world world-preview" aria-hidden="true" inert><WorldRenderer state={previewState} onAction={previewAction} onTalk={previewTalk} preview /></div>
      <main className="welcome-screen"><a className="brand" href="/">Speak Your Way<span className="brand-dot">.</span></a>{starter}</main>
    </div>;
  }

  const state = session.state;
  const guide = state.directions ? state.interactables.find((item) => item.id === state.directions?.fromAnchorId && item.kind === 'npc') : undefined;

  return <div className="game-shell" data-testid="game-shell" data-dialogue-open={Boolean(npc)}>
    <header className="game-topbar"><a className="brand" href="#world">Speak Your Way<span className="brand-dot">.</span></a>{state.validationMode ? <span className="environment-banner">Developer validation · all XP, loot and badges are simulated. Progress stays separate from player sessions.</span> : state.providerStatus !== 'live' ? <span className="environment-banner">{state.providerStatus === 'fixture' ? 'Fixture demonstration · scripted responses' : 'Voice or AI service is degraded · retry or use the same-world fallback.'}</span> : null}<div className="topbar-controls">
      <LookupPanel />
      <ReviewPanel />
      {!state.validationMode && <BackgroundMusic active={state.status === 'active'} conversation={Boolean(npc)} />}
      <details className="game-settings" onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}>
        <summary className="button secondary topbar-icon" aria-label="Settings" title="Settings" onClick={() => setSettingsRotation((rotation) => rotation + 90)}>
          <svg className="settings-cog" style={{ transform: `rotate(${settingsRotation}deg)` }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <g transform="translate(1.5 .5)">
              <path d="m9 3-.6 2.4-2 .9L4.2 6 2.7 8.6l1.6 1.8v2.3l-1.6 1.8L4.2 17l2.2-.3 2 .9L9 20h3l.6-2.4 2-.9 2.2.3 1.5-2.5-1.6-1.8v-2.3l1.6-1.8L16.8 6l-2.2.3-2-.9L12 3Z" />
              <circle cx="10.5" cy="11.5" r="3" />
            </g>
          </svg>
        </summary>
        <div className="settings-popover"><h2>Audio settings</h2><AudioController state={state} onAction={onAction} speechId={session.turn?.speechId} /><h2 className="settings-controls-title">Controls</h2><dl className="controls-list"><dt>WASD / arrows</dt><dd>Walk</dd><dt>Click</dt><dd>Walk there</dd><dt>Drag sideways</dt><dd>Orbit camera</dd><dt>Drag up / down</dt><dd>Tilt camera</dd><dt>E</dt><dd>Interact with the nearest target</dd><dt>Esc</dt><dd>Close a conversation</dd></dl></div>
      </details>
      </div></header>
    <main className="game-main">
      <div className="game-world" id="world"><WorldRenderer key={attempt} conversationOpen={Boolean(npc)} state={state} onAction={onAction} onTalk={onTalk} guidanceContainer={guidanceContainer} /></div>
      <QuestPanel state={state} results={results} onReview={openReview} conversationOpen={Boolean(npc)} guidanceRef={setGuidanceContainer} />
      <RecoveryPanel problem={session.problem} pending={session.pending} state={state} onRetry={session.retry} onRefresh={session.refresh} onNew={leave} onDismiss={session.dismiss} />
      {session.events.length > 0 && <section className="event-feed" aria-label="Quest updates" aria-live="polite">{session.events.slice(-3).map((event) => <p key={event.id}>{event.message}</p>)}</section>}
      {npc && state.status === 'active' && <DialoguePanel key={`${state.sessionId}:${state.missionId}:${npc.anchorId}`} state={state} npc={npc} pending={session.pending} turn={session.turnNpc === npc.anchorId ? session.turn : null} onAction={onAction} onSubmit={session.submit} onLiveTurn={session.applyTurn} onClose={closeConversation} />}
      {state.directions && !npc && <DirectionsCard directions={state.directions} pending={session.pending || !guide} onRepeat={() => onTalk(state.directions!.fromAnchorId)} />}
      {state.photo && <PhotoOverlay state={state} pending={session.pending} onAction={onAction} />}
      {conversation && !npc && state.status === 'active' && <ConversationCard summary={conversation} turn={conversation.turn} state={state} pending={session.pending} onAction={onAction} onClose={closeConversationCard} />}
      {(review ? results[review] : resultsClosed ? null : state.status !== 'active' ? state : null) && <ResultPanel state={(review && results[review]) ?? state} live={state} pending={session.pending} onAction={onAction} onExit={leave} onClose={closeResults} />}
      {validation && state.validationMode && ValidationHarness && <Suspense fallback={<p>Loading internal validator…</p>}><ValidationHarness state={state} onAction={onAction} onTalk={onTalk} /></Suspense>}
    </main>
    <GlossPopover />
  </div>;
}
