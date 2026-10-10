import { useCallback, useEffect, useState } from 'react';
import { createBaselineState, type GameAction } from '@vibequest/shared';
import { WorldRenderer } from '../world/WorldRenderer';
import { Recorder } from '../audio/Recorder';
import { AudioController } from '../audio/AudioController';
import { SkillDebrief } from '../ui/SkillDebrief';
import { act, createSession, SessionClientError } from './session-client';

type HealthStatus = {
  status: 'ok';
  buildId: string;
  specVersion: string;
  providers: { geminiConfigured: boolean; elevenlabsConfigured: boolean };
  features: { validationHarness: boolean; fixtures: boolean };
  segments: { engine: string; dialogue: string; speech: string };
};

function Icon({ kind }: { kind: 'world' | 'route' | 'voice' | 'spark' }) {
  const paths = {
    world: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c5 5 5 11 0 16-5-5-5-11 0-16Z" /></>,
    route: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 6h6a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h7" /></>,
    voice: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8" /></>,
    spark: <><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{paths[kind]}</svg>;
}

export function BootstrapPreview({ children }: { children: import('react').ReactNode }) {
  const [state] = useState(() => createBaselineState('P1'));
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState('');
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/health', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`API health returned ${response.status}.`);
        return response.json() as Promise<HealthStatus>;
      })
      .then(setHealth)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setHealthError(error instanceof Error ? error.message : 'API health is unavailable.');
        }
      });
    return () => controller.abort();
  }, []);

  const onAction = useCallback(async (action: GameAction) => {
    try {
      await act(state.sessionId, { actionId: crypto.randomUUID(), expectedVersion: state.version, action });
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : 'The action is unavailable.');
    }
  }, [state]);

  const onTalk = useCallback((npcId: string) => {
    setNotice(`NPC conversation (${npcId}) is unimplemented. Segment-003 mounts the shared dialogue panel; Segment-005 adds the voice loop.`);
  }, []);

  async function checkSessionSeam() {
    setChecking(true);
    try {
      await createSession({ initialTier: 0, providerMode: 'live', validationMode: false, inputPreference: 'voice' });
      setNotice('The session endpoint responded. This bootstrap preview does not start or advance a mission.');
    } catch (error: unknown) {
      const prefix = error instanceof SessionClientError ? `HTTP ${error.status} · ` : '';
      setNotice(`${prefix}${error instanceof Error ? error.message : 'The session endpoint is unavailable.'}`);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#district" aria-label="VibeQuest home"><span lang="zh-Hans">语</span>VibeQuest<span className="brand-dot">.</span></a>
        <div className="sidebar-intro"><span className="eyebrow">MANDARIN IN MOTION</span><p>A little courage.<br />A whole new world.</p></div>
        <nav aria-label="Preview navigation">
          <a className="nav-item selected" href="#district"><Icon kind="world" />The district<span>01</span></a>
          <a className="nav-item" href="#journey"><Icon kind="route" />Your journey</a>
          <a className="nav-item" href="#voice"><Icon kind="voice" />Conversation</a>
        </nav>
        <div className="sidebar-card"><span lang="zh-Hans">你好，冒险家。</span><p>Hello, adventurer.<br />Mandarin is how you move through this world.</p></div>
        <div className="sidebar-footer"><span className="live-dot" />HackRU 2026<span>Bootstrap · v1.2</span></div>
      </aside>

      <main>
        <header className="topbar"><div className="breadcrumb">Your neighborhood <span>/</span> First steps</div><span className="build-badge">Segment-000 scaffold</span></header>
        <section className="intro" id="district">
          <div><span className="eyebrow">EXPLORE. SPEAK. FIND YOUR WAY.</span><h1>Every street has a story.</h1><p>Read the signs. Talk to the locals. Let Mandarin lead the way.</p></div>
          <span className="language-chip"><span lang="zh-Hans">中文</span>Mandarin Chinese</span>
        </section>

        <div className="bootstrap-banner" role="status"><Icon kind="spark" /><div><strong>The foundation is ready to build on.</strong><span>Static fixture preview. Gameplay, NPC intelligence, movement, and voice are unimplemented.</span></div><span className="banner-tag">DEVELOPMENT</span></div>

        {children}
        <div className="district-layout">
          <div className="world-column">
            <WorldRenderer state={state} onAction={onAction} onTalk={onTalk} />
            <section className="sign-preview" aria-label="Mandarin sign fixture">
              <div><span className="eyebrow">ENVIRONMENTAL TEXT · FIXTURE</span><p lang="zh-Hans">请从广场进入。这扇门关闭了。</p></div>
              <span className="small-label">Simplified Chinese<br />One world, one experience</span>
            </section>
          </div>

          <aside className="journey-card" id="journey">
            <span className="eyebrow">YOUR FIRST CHAPTER</span><div className="chapter-heading"><h2>Café detour</h2><span>练习</span></div>
            <p className="chapter-description">A drink, a conversation, and a new way to the station.</p>
            <div className="mission-meta"><span>Practice · {state.missionId}</span><span>Fixture state</span></div>
            <ol className="journey-steps">
              <li><span>01</span><div><strong>Read the neighborhood</strong><p>Find your way with Mandarin signs.</p></div></li>
              <li><span>02</span><div><strong>Meet <span lang="zh-Hans">小林</span></strong><p>Speak, listen, and work things out.</p></div></li>
              <li><span>03</span><div><strong>Make your next move</strong><p>Follow directions to the station.</p></div></li>
            </ol>
            <button className="button primary" disabled={checking} onClick={() => void checkSessionSeam()}>{checking ? 'Checking…' : 'Check session seam'}<span aria-hidden="true">↗</span></button>
            <p className="seam-note">Session API is a 501 stub in Segment-000.<br />This button checks the connection only.</p>
            <div className="fixture-summary" data-testid="fixture-state"><span>Session fixture</span><code>{state.sessionId}</code><span>Version {state.version} · {state.status} · XP {state.xp}</span></div>
          </aside>
        </div>

        <section className="conversation-section" id="voice"><div className="section-heading"><h2>Conversation is the adventure.</h2><span>VOICE-LED EXPERIENCE</span></div><Recorder state={state} npcId="xiaolin" onAction={onAction} onTranscript={() => setNotice('Transcript delivery is unimplemented in Segment-000.')} /><AudioController state={state} onAction={onAction} /></section>
        {notice && <div className="action-notice" role="alert" data-testid="session-notice">{notice}</div>}
        <SkillDebrief state={state} />

        <footer className="health-panel" aria-label="API configuration status" data-testid="api-health">
          <div><span className={health ? 'health-dot ready' : 'health-dot'} /><strong>{health ? 'API connected' : healthError ? 'API unavailable' : 'Connecting to API…'}</strong><span>{health?.buildId ?? healthError}</span></div>
          <dl><div><dt>Gemini</dt><dd>{health ? health.providers.geminiConfigured ? 'Configured' : 'Missing' : 'Checking'}</dd></div><div><dt>ElevenLabs</dt><dd>{health ? health.providers.elevenlabsConfigured ? 'Configured' : 'Missing' : 'Checking'}</dd></div><div><dt>Engine</dt><dd>{health?.segments.engine ?? 'Checking'}</dd></div></dl>
          <p>Configured flags indicate key presence. No live provider call has been verified by this scaffold.</p>
        </footer>

      </main>
    </div>
  );
}
