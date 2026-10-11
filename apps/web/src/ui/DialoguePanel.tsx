import { useCallback, useEffect, useRef, useState } from 'react';
import { npcOpeners, pendingGoalAction, type PublicState, type RendererProps, type TurnRequest, type TurnResponse } from '@vibequest/shared';
import { Recorder } from '../audio/Recorder';
import { finishConfirmation, useAudioActivity } from '../audio/audio-bus';
import { startLiveVoice, type LiveStatus } from '../audio/live-voice';
import '../audio/live.css';
import { CoachPanel } from './CoachPanel';
import { NpcActions } from './NpcActions';
import { explainElement } from '../dictionary/GlossPopover';
import { roleNames, type ConversationSummary, type NpcTarget, type ThreadLine as Line } from './ConversationCard';

const AUTO_SEND_SECONDS = 4;

/** Patience cue: the NPC's mood in words, never a countdown. */
const moodWords = { warm: 'friendly', neutral: 'getting busy', terse: 'impatient', disengaged: 'leaving' } as const;

export function DialoguePanel({ state, npc, pending, turn, onAction, onSubmit, onLiveTurn, onClose }: {
  state: PublicState; npc: NpcTarget; pending: boolean; turn: TurnResponse | null;
  onAction: RendererProps['onAction']; onSubmit: (npc: NpcTarget, input: TurnRequest['input']) => Promise<void>; onLiveTurn?: (npc: NpcTarget, turn: TurnResponse) => void; onClose: (ended?: ConversationSummary) => void;
}) {
  const name = npc.name;
  const [draft, setDraft] = useState('');
  const [transcription, setTranscription] = useState<{ id: string; original: string } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  // NEW_QUESTS: the NPC speaks first (the vendor opens with 你想喝什么？).
  const [thread, setThread] = useState<Line[]>(() => [{ role: 'npc', text: npcOpeners[npc.role] }]);
  const threadRef = useRef<Line[]>([]); threadRef.current = thread;
  // A goodbye closes with the exchange attached so the app can show the conversation summary card.
  const finish = useCallback(() => onClose({ npc, thread: threadRef.current }), [onClose, npc]);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const composing = useRef(false);
  const firstButton = useRef<HTMLButtonElement>(null);
  const sendRef = useRef<() => Promise<void>>(async () => undefined);
  // Real-time lane: practice missions with live providers stream speech both ways; anything else uses the batch recorder.
  const [live, setLive] = useState<{ status: LiveStatus; message?: string; retryable?: boolean } | null>(null);
  const [liveAttempt, setLiveAttempt] = useState(0);
  const [partial, setPartial] = useState<{ player: string; npc: string }>({ player: '', npc: '' });
  // Once the finishing button is up, the talking is over: only the button completes the task (the server rejects further turns).
  const goal = state.status === 'active' ? pendingGoalAction(state.npcActions, state.inventory.cny, npc.role) : undefined;
  const liveEligible = !goal && Boolean(onLiveTurn) && state.mode === 'practice' && state.providerStatus === 'live' && state.inputPreference === 'voice' && state.status === 'active';
  const liveActive = live !== null && !['unavailable', 'ended'].includes(live.status);
  const pauseRef = useRef<((on: boolean) => void) | null>(null);
  // A goodbye turn closes the panel once its reply has played (live: when the server closes), capped so it never hangs.
  const [closing, setClosing] = useState(false);
  const activity = useAudioActivity();
  const played = useRef(false);
  // No goodbye audio within 1.5 s (fixtures, muted, failed speech): close right away; otherwise after playback, capped at 8 s.
  useEffect(() => { if (!closing) return; const quiet = setTimeout(() => { if (!played.current) finish(); }, 1_500); const cap = setTimeout(finish, 8_000); return () => { clearTimeout(quiet); clearTimeout(cap); }; }, [closing, finish]);
  useEffect(() => { if (!closing) return; if (activity === 'playing') played.current = true; else if (played.current) finish(); }, [closing, activity, finish]);
  useEffect(() => {
    if (!liveEligible) { setLive(null); return; }
    setLive({ status: 'connecting' }); setPartial({ player: '', npc: '' });
    const handle = startLiveVoice(state.sessionId, npc.role, npc.anchorId, (event) => {
      if (event.kind === 'status') {
        // A failed evaluation is a notice in the thread; the mic keeps listening. Connection problems replace the status row.
        if (event.status === 'error' && event.retryable) { setThread((lines) => [...lines, { role: 'notice', text: event.message ?? 'That turn could not be evaluated. Say it again.' }]); return; }
        if (event.status === 'ended' && event.reason === 'farewell') { finish(); return; }
        setLive({ status: event.status, message: event.message, retryable: event.retryable }); return;
      }
      if (event.kind === 'turn') {
        onLiveTurn?.(npc, event.turn);
        if (event.turn.conversationEnded) { setClosing(true); pauseRef.current?.(true); }
        // Coaching and penalties stay visible in the thread.
        const extra: Line[] = [...(event.turn.feedback ? [{ role: 'coach', feedback: event.turn.feedback } as Line] : []), ...event.turn.events.map((item) => ({ role: 'notice', text: item.message } as Line))];
        if (extra.length) setThread((lines) => [...lines, ...extra]);
        return;
      }
      if (!event.final) { setPartial((current) => ({ ...current, [event.kind]: event.text })); return; }
      setPartial((current) => ({ ...current, [event.kind]: '' }));
      if (event.text.trim()) setThread((lines) => [...lines, { role: event.kind, text: event.text }]);
    });
    pauseRef.current = handle.pause;
    return () => { pauseRef.current = null; handle.stop(); };
  }, [liveEligible, liveAttempt, state.sessionId, npc.anchorId]); // onLiveTurn is stable per session

  useEffect(() => { firstButton.current?.focus(); }, []);
  // A turn that already existed when the panel opened belongs to the previous conversation: never replay it (or its goodbye).
  const openedWith = useRef(turn?.turnId ?? null);
  useEffect(() => {
    if (!turn?.turnId || liveActive || turn.turnId === openedWith.current) return; // live turns already carry their transcripts into the thread
    // Update the ref alongside state so an immediate goodbye hands the complete exchange to the summary card.
    threadRef.current = [...threadRef.current, ...(outgoing ? [{ role: 'player', text: outgoing } as Line] : []), { role: 'npc', text: turn.npcReply }];
    setThread(threadRef.current);
    setOutgoing(null); setDraft(''); setTranscription(null); setCountdown(null);
    if (turn.conversationEnded) { if (turn.speechId) setClosing(true); else finish(); }
  }, [turn?.turnId]); // outgoing is read once per new turn; liveActive is read at turn time
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.isComposing && !composing.current) { event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('keydown', close); previous?.focus(); };
  }, [onClose]);
  // Unedited transcripts send themselves; any edit, pending turn or new turn cancels the countdown.
  useEffect(() => {
    if (countdown === null || pending) return;
    if (countdown <= 0) { setCountdown(null); void sendRef.current(); return; }
    const timer = setTimeout(() => setCountdown((value) => (value === null ? null : value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown, pending]);

  async function send() {
    if (composing.current || pending || !draft.trim()) return;
    const input: TurnRequest['input'] = transcription ? { text: draft, transcriptionId: transcription.id, source: draft === transcription.original ? 'stt' : 'stt-edited' } : { text: draft, source: 'typed' };
    setCountdown(null); setOutgoing(draft);
    try { await finishConfirmation(); await onSubmit(npc, input); setDraft(''); setTranscription(null); } catch { setOutgoing(null); /* parent shows structured recovery without losing the draft */ }
  }
  sendRef.current = send;
  const lastNpc = thread.map((line) => line.role).lastIndexOf('npc');

  return <section className="dialogue-panel" role="dialog" aria-modal="false" aria-labelledby="dialogue-title" data-testid="dialogue-panel" onKeyDown={(event) => {
    // The world owner also ignores editable targets. Keep gameplay keys within the panel.
    if (event.key !== 'Escape') event.stopPropagation();
  }}>
    <header><div><span className="eyebrow">CONVERSATION</span><h2 id="dialogue-title" lang="zh-Hans">{name}</h2><span className="mood-label" data-mood={state.npcMood[npc.role]}>{roleNames[npc.role]} · {moodWords[state.npcMood[npc.role]]}</span></div><button ref={firstButton} className="button secondary" onClick={() => onClose()} aria-label="Close conversation">Close · Esc</button></header>
    {(thread.length > 0 || outgoing) && <div className="chat-thread" aria-live="polite">
      {thread.map((line, index) => line.role === 'coach'
        ? <div key={index} className="bubble coach" data-testid="live-coach"><span>{line.feedback.understood}</span><span>{line.feedback.explanation}</span><span className="mandarin-chip" lang="zh-Hans">{line.feedback.improvedExample}</span></div>
        : line.role === 'notice' ? <p key={index} className="thread-notice" role="status">{line.text}</p>
        : <p key={index} className={`bubble ${line.role}`} lang="zh-Hans" {...(index === lastNpc ? { 'data-testid': 'npc-reply' } : {})}
          {...(line.role === 'npc' ? { tabIndex: 0, title: 'Shift+click a word, or press Enter, for pinyin and English', onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => { if (event.key === 'Enter') { event.preventDefault(); explainElement(event.currentTarget); } } } : {})}>{line.text}</p>)}
      {outgoing && <p className="bubble player sending" lang="zh-Hans">{outgoing}</p>}
    </div>}
    {liveActive && (partial.player || partial.npc) && <div className="chat-thread" aria-hidden="true">
      {partial.npc && <p className="bubble npc partial" lang="zh-Hans">{partial.npc}</p>}
      {partial.player && <p className="bubble player partial" lang="zh-Hans">{partial.player}</p>}
    </div>}
    {pending && <div className="conversation-status" role="status">{name} is thinking<span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span></div>}
    {closing && <div className="conversation-status" role="status" data-testid="conversation-closing">Conversation finished</div>}
    {!closing && !goal && liveActive && live && <div className="live-status" role="status" data-testid="live-status" data-status={live.status}>
      <span className={`live-mic ${live.status}`} aria-hidden="true" />
      <span>{live.status === 'connecting' ? 'Connecting…' : live.status === 'npc-speaking' ? `${name} is speaking…` : live.status === 'paused' ? 'Mic paused' : live.status === 'error' ? live.message ?? 'Live voice hit a problem.' : 'Listening… just talk'}</span>
      {live.status === 'error' ? (live.retryable && <button type="button" className="button secondary" onClick={() => setLiveAttempt((count) => count + 1)}>Retry</button>)
        : <button type="button" className="button secondary" onClick={() => pauseRef.current?.(live.status !== 'paused')}>{live.status === 'paused' ? 'Resume' : 'Pause mic'}</button>}
    </div>}
    {/* After a goodbye nothing more can be said: the controls go away until the summary card replaces the panel. */}
    {!closing && goal && <p className="conversation-status" role="status" data-testid="goal-hint">Click to finish.</p>}
    {!closing && <>
    {!goal && <>
    {!liveActive && <div className="recorder-mount" aria-busy={pending}><Recorder state={state} npcId={npc.role} onAction={onAction} onTranscript={(result) => { setTranscription({ id: result.transcriptionId, original: result.text }); setDraft(result.text); setCountdown(AUTO_SEND_SECONDS); }} /></div>}
    <button className="button secondary" disabled={pending} onClick={() => void onAction({ type: 'setInputPreference', preference: state.inputPreference === 'voice' ? 'typed-accessibility' : 'voice' }).catch(() => undefined)}>{state.inputPreference === 'voice' ? 'Use typed Mandarin' : 'Use voice'}</button>
    {(state.inputPreference === 'typed-accessibility' || transcription) && <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <label className="field-label" htmlFor="mandarin-input">{transcription ? 'What you said' : 'Typed Mandarin'}</label>
      <textarea id="mandarin-input" lang="zh-Hans" value={draft} maxLength={500} rows={3} disabled={pending}
        onChange={(event) => { setCountdown(null); setDraft(event.target.value); }} onCompositionStart={() => { composing.current = true; setCountdown(null); }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) void send(); }
        }} />
      <div className="input-footer"><span>{countdown !== null ? <strong className="countdown">Sending in {countdown}…</strong> : transcription ? 'Edit if that is not what you said.' : 'Typed input does not count as spoken evidence.'}</span><button className="button primary" type="submit" disabled={pending || !draft.trim()}>Send Mandarin</button></div>
    </form>}
    </>}
    <NpcActions state={state} anchorId={npc.anchorId} extra={turn?.actions} pending={pending} onAction={onAction} onClose={() => onClose()} onEnd={finish} />
    </>}
    <CoachPanel state={state} turn={turn} />
  </section>;
}
