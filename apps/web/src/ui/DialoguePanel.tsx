import { Button, TextArea, GameDialog, Dialog } from './primitives';
import { useEffect, useRef, useState } from 'react';
import { NpcIdSchema, type GameAction, type PublicState, type RendererProps, type TurnRequest, type TurnResponse } from '@vibequest/shared';
import { Recorder } from '../audio/Recorder';
import { finishConfirmation, useAudioActivity } from '../audio/audio-bus';
import { startLiveVoice, type LiveStatus } from '../audio/live-voice';
import '../audio/live.css';
import { CoachPanel } from './CoachPanel';

type Line = { role: 'player' | 'npc' | 'notice'; text: string } | { role: 'coach'; feedback: NonNullable<TurnResponse['feedback']> };
const AUTO_SEND_SECONDS = 4;

export function DialoguePanel({ state, npcId, pending, turn, choices = [], onAction, onSubmit, onLiveTurn, onClose }: {
  state: PublicState; npcId: string; pending: boolean; turn: TurnResponse | null; choices?: PublicState['interactables'];
  onAction: RendererProps['onAction']; onSubmit: (npcId: string, input: TurnRequest['input']) => Promise<void>; onLiveTurn?: (npcId: string, turn: TurnResponse) => void; onClose: () => void;
}) {
  const npc = NpcIdSchema.parse(npcId);
  const names = { xiaolin: '小林', achen: '阿陈', laozhou: '老周' };
  const [draft, setDraft] = useState('');
  const [transcription, setTranscription] = useState<{ id: string; original: string } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [thread, setThread] = useState<Line[]>([]);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const composing = useRef(false);
  const sendRef = useRef<() => Promise<void>>(async () => undefined);
  // Real-time lane: practice missions with live providers stream speech both ways; anything else uses the batch recorder.
  const [live, setLive] = useState<{ status: LiveStatus; message?: string; retryable?: boolean } | null>(null);
  const [liveAttempt, setLiveAttempt] = useState(0);
  const [partial, setPartial] = useState<{ player: string; npc: string }>({ player: '', npc: '' });
  const liveEligible = Boolean(onLiveTurn) && state.mode === 'practice' && state.providerStatus === 'live' && state.inputPreference === 'voice' && state.status === 'active';
  const liveActive = live !== null && !['unavailable', 'ended'].includes(live.status);
  const pauseRef = useRef<((on: boolean) => void) | null>(null);
  // A goodbye turn closes the panel once its reply has played (live: when the server closes), capped so it never hangs.
  const [closing, setClosing] = useState(false);
  const activity = useAudioActivity();
  const played = useRef(false);
  useEffect(() => { if (!closing) return; const cap = setTimeout(onClose, 6_000); return () => clearTimeout(cap); }, [closing, onClose]);
  useEffect(() => { if (!closing) return; if (activity === 'playing') played.current = true; else if (played.current) onClose(); }, [closing, activity, onClose]);
  useEffect(() => {
    if (!liveEligible) { setLive(null); return; }
    setLive({ status: 'connecting' }); setPartial({ player: '', npc: '' });
    const handle = startLiveVoice(state.sessionId, npc, (event) => {
      if (event.kind === 'status') {
        // A failed evaluation is a notice in the thread; the mic keeps listening. Connection problems replace the status row.
        if (event.status === 'error' && event.retryable) { setThread((lines) => [...lines, { role: 'notice', text: event.message ?? 'That turn could not be evaluated. Say it again.' }]); return; }
        if (event.status === 'ended' && event.reason === 'farewell') { onClose(); return; }
        setLive({ status: event.status, message: event.message, retryable: event.retryable }); return;
      }
      if (event.kind === 'turn') {
        onLiveTurn?.(npc, event.turn);
        if (event.turn.conversationEnded) setClosing(true);
        // Practice only (live mode never runs in boss): coaching and penalties stay visible in the thread.
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
  }, [liveEligible, liveAttempt, state.sessionId, npc]); // onLiveTurn is stable per session

  useEffect(() => {
    if (!turn?.turnId || liveActive) return; // live turns already carry their transcripts into the thread
    setThread((lines) => [...lines, ...(outgoing ? [{ role: 'player', text: outgoing } as Line] : []), { role: 'npc', text: turn.npcReply }]);
    setOutgoing(null); setDraft(''); setTranscription(null); setCountdown(null);
    if (turn.conversationEnded) { if (turn.speechId) setClosing(true); else onClose(); }
  }, [turn?.turnId]); // outgoing is read once per new turn; liveActive is read at turn time
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

  return <GameDialog onClose={onClose} onEscape={(event) => { if (composing.current) event.preventDefault(); }}><section className="dialogue-panel" role="dialog" aria-modal="false" aria-labelledby="dialogue-title" data-testid="dialogue-panel" onKeyDown={(event) => {
    // The world owner also ignores editable targets. Keep gameplay keys within the panel.
    if (event.key !== 'Escape') event.stopPropagation();
  }}>
    <header><div><span className="eyebrow">CONVERSATION</span><Dialog.Title asChild><h2 id="dialogue-title" lang="zh-Hans">{names[npc]}</h2></Dialog.Title><span className="mood-label">{state.npcMood[npc]}</span></div><Button className="button secondary" onClick={onClose} aria-label="Close conversation">Close · Esc</Button></header>
    {(thread.length > 0 || outgoing) && <div className="chat-thread" aria-label="Mission updates" aria-live="polite">
      {thread.map((line, index) => line.role === 'coach'
        ? <div key={index} className="bubble coach" data-testid="live-coach"><span>{line.feedback.understood}</span><span>{line.feedback.explanation}</span><span className="mandarin-chip" lang="zh-Hans">{line.feedback.improvedExample}</span></div>
        : line.role === 'notice' ? <p key={index} className="thread-notice" role="status">{line.text}</p>
        : <p key={index} className={`bubble ${line.role}`} lang="zh-Hans" {...(index === lastNpc ? { 'data-testid': 'npc-reply' } : {})}>{line.text}</p>)}
      {outgoing && <p className="bubble player sending" lang="zh-Hans">{outgoing}</p>}
    </div>}
    {liveActive && (partial.player || partial.npc) && <div className="chat-thread" aria-hidden="true">
      {partial.npc && <p className="bubble npc partial" lang="zh-Hans">{partial.npc}</p>}
      {partial.player && <p className="bubble player partial" lang="zh-Hans">{partial.player}</p>}
    </div>}
    {pending && <div className="conversation-status" role="status">{names[npc]} is thinking<span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span></div>}
    {liveActive && live && <div className="live-status" role="status" data-testid="live-status" data-status={live.status}>
      <span className={`live-mic ${live.status}`} aria-hidden="true" />
      <span>{live.status === 'connecting' ? 'Connecting…' : live.status === 'npc-speaking' ? `${names[npc]} is speaking…` : live.status === 'paused' ? 'Mic paused' : live.status === 'error' ? live.message ?? 'Live voice hit a problem.' : 'Listening… just talk'}</span>
      {live.status === 'error' ? (live.retryable && <Button type="button" className="button secondary" onClick={() => setLiveAttempt((count) => count + 1)}>Retry</Button>)
        : <Button type="button" className="button secondary" onClick={() => pauseRef.current?.(live.status !== 'paused')}>{live.status === 'paused' ? 'Resume' : 'Pause mic'}</Button>}
    </div>}
    {!liveActive && <div className="recorder-mount" aria-busy={pending}><Recorder state={state} npcId={npc} onAction={onAction} onTranscript={(result) => { setTranscription({ id: result.transcriptionId, original: result.text }); setDraft(result.text); setCountdown(AUTO_SEND_SECONDS); }} /></div>}
    <Button className="button secondary" disabled={pending} onClick={() => void onAction({ type: 'setInputPreference', preference: state.inputPreference === 'voice' ? 'typed-accessibility' : 'voice' }).catch(() => undefined)}>{state.inputPreference === 'voice' ? 'Use typed Mandarin' : 'Use voice'}</Button>
    {(state.inputPreference === 'typed-accessibility' || transcription) && <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <label className="field-label" htmlFor="mandarin-input">{transcription ? 'What you said' : 'Typed Mandarin'}</label>
      <TextArea id="mandarin-input" lang="zh-Hans" value={draft} maxLength={500} rows={3} disabled={pending}
        onChange={(event) => { setCountdown(null); setDraft(event.target.value); }} onCompositionStart={() => { composing.current = true; setCountdown(null); }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) void send(); }
        }} />
      <div className="input-footer"><span>{countdown !== null ? <strong className="countdown">Sending in {countdown}…</strong> : transcription ? 'Edit if that is not what you said.' : 'Typed input does not count as spoken evidence.'}</span><Button className="button primary" type="submit" disabled={pending || !draft.trim()}>Send Mandarin</Button></div>
    </form>}
    {choices.length > 0 && <div className="chat-actions" aria-label="Actions">{choices.map((item) => <Button className="button secondary" key={item.id} disabled={pending} lang="zh-Hans" onClick={() => void onAction({ type: 'choose', choiceId: item.id as Extract<GameAction, { type: 'choose' }>['choiceId'] }).catch(() => undefined)}>{item.label}</Button>)}</div>}
    <CoachPanel state={state} turn={turn} />
  </section></GameDialog>;
}
