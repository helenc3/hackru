import { useEffect, useRef, useState } from 'react';
import { NpcIdSchema, type PublicState, type RendererProps, type TurnRequest, type TurnResponse } from '@vibequest/shared';
import { Recorder } from '../audio/Recorder';
import { finishConfirmation } from '../audio/audio-bus';
import { CoachPanel } from './CoachPanel';

export function DialoguePanel({ state, npcId, pending, turn, onAction, onSubmit, onClose }: {
  state: PublicState; npcId: string; pending: boolean; turn: TurnResponse | null;
  onAction: RendererProps['onAction']; onSubmit: (npcId: string, input: TurnRequest['input']) => Promise<void>; onClose: () => void;
}) {
  const npc = NpcIdSchema.parse(npcId);
  const names = { xiaolin: '小林', achen: '阿陈', laozhou: '老周' };
  const [draft, setDraft] = useState('');
  const [transcription, setTranscription] = useState<{ id: string; original: string } | null>(null);
  const [notice, setNotice] = useState('');
  const composing = useRef(false);
  const firstButton = useRef<HTMLButtonElement>(null);

  useEffect(() => { firstButton.current?.focus(); }, []);
  useEffect(() => { if (turn?.turnId) { setDraft(''); setTranscription(null); setNotice(''); } }, [turn?.turnId]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.isComposing && !composing.current) { event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('keydown', close); previous?.focus(); };
  }, [onClose]);

  async function send() {
    if (composing.current || pending || !draft.trim()) return;
    const input: TurnRequest['input'] = transcription ? { text: draft, transcriptionId: transcription.id, source: draft === transcription.original ? 'stt' : 'stt-edited' } : { text: draft, source: 'typed' };
    try { await finishConfirmation(); await onSubmit(npc, input); setDraft(''); setTranscription(null); setNotice(''); } catch { /* parent shows structured recovery without losing the draft */ }
  }

  return <section className="dialogue-panel" role="dialog" aria-modal="false" aria-labelledby="dialogue-title" data-testid="dialogue-panel" onKeyDown={(event) => {
    // The world owner also ignores editable targets. Keep gameplay keys within the panel.
    if (event.key !== 'Escape') event.stopPropagation();
  }}>
    <header><div><span className="eyebrow">CONVERSATION</span><h2 id="dialogue-title" lang="zh-Hans">{names[npc]}</h2><span className="mood-label">{state.npcMood[npc]}</span></div><button ref={firstButton} className="button secondary" onClick={onClose} aria-label="Close conversation">Close · Esc</button></header>
    <p className="voice-intro">Speak Mandarin, hear the reply, then make your next move.</p>
    <div className="conversation-status" role="status">{pending ? 'Waiting for the server… Your input is preserved.' : 'Ready for your next turn.'}</div>
    <div className="recorder-mount" aria-busy={pending}><Recorder state={state} npcId={npc} onAction={onAction} onTranscript={(result) => { setTranscription({ id: result.transcriptionId, original: result.text }); setDraft(result.text); setNotice('Review what was heard, then send. Editing preserves the meaning but is recorded as edited input.'); }} /></div>
    {turn && <div className="npc-reply" data-testid="npc-reply"><span>NPC reply</span><p lang="zh-Hans">{turn.npcReply}</p></div>}
    <button className="button secondary" disabled={pending} onClick={() => void onAction({ type: 'setInputPreference', preference: state.inputPreference === 'voice' ? 'typed-accessibility' : 'voice' }).catch(() => undefined)}>{state.inputPreference === 'voice' ? 'Use typed Mandarin' : 'Use voice'}</button>
    {(state.inputPreference === 'typed-accessibility' || transcription) && <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <label className="field-label" htmlFor="mandarin-input">{transcription ? 'Confirm Mandarin transcript' : 'Typed Mandarin · same conversation'}</label>
      <textarea id="mandarin-input" lang="zh-Hans" value={draft} maxLength={500} rows={3} disabled={pending}
        onChange={(event) => setDraft(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) void send(); }
        }} />
      <div className="input-footer"><span>{draft.length}/500 · {transcription ? 'Transcript confirmation' : 'Typed input does not count as spoken evidence.'}</span><button className="button primary" type="submit" disabled={pending || !draft.trim()}>Send Mandarin</button></div>
    </form>}
    {notice && <p role="status">{notice}</p>}
    <CoachPanel state={state} turn={turn} />
  </section>;
}
