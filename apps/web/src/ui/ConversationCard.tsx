import { useEffect, useRef } from 'react';
import type { NpcId, PublicState, RendererProps, TurnResponse } from '@vibequest/shared';
import { CoachPanel } from './CoachPanel';
import { NpcActions } from './NpcActions';
import { useEscape } from './use-escape';

/** The NPC anchor being talked to: role drives dialogue rules, name comes from the reviewed name list via the anchor label. */
export type NpcTarget = { anchorId: string; role: NpcId; name: string };
export const roleNames: Record<NpcId, string> = { vendor: 'Drink vendor', guide: 'Local guide', passerby: 'Passerby' };
export type ThreadLine = { role: 'player' | 'npc' | 'notice'; text: string } | { role: 'coach'; feedback: NonNullable<TurnResponse['feedback']> };
export type ConversationSummary = { npc: NpcTarget; thread: ThreadLine[] };

/** Shown once a goodbye ends a conversation: the exchange, practice feedback, and objective progress. */
export function ConversationCard({ summary, turn, state, pending, onAction, onClose }: { summary: ConversationSummary; turn: TurnResponse | null; state: PublicState; pending: boolean; onAction: RendererProps['onAction']; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  useEscape(onClose);
  const spoken = summary.thread.filter((line): line is Extract<ThreadLine, { text: string }> => line.role === 'player' || line.role === 'npc');
  return <section className="conversation-card" role="dialog" aria-labelledby="conversation-title" data-testid="conversation-card">
    <button ref={close} type="button" className="button secondary result-close" onClick={onClose} aria-label="Close conversation summary">✕</button>
    <span className="eyebrow">CONVERSATION COMPLETE</span>
    <h2 id="conversation-title"><span lang="zh-Hans">{summary.npc.name}</span> said goodbye.</h2>
    <p>{spoken.length} lines exchanged · mood {state.npcMood[summary.npc.role]}</p>
    {spoken.length > 0 && <div className="chat-thread" aria-label="Conversation transcript">{spoken.map((line, index) => <p key={index} className={`bubble ${line.role}`} lang="zh-Hans">{line.text}</p>)}</div>}
    <CoachPanel state={state} turn={turn} />
    <h3>Quest progress</h3>
    <ul className="result-objectives" aria-label="Quest summary">{state.objectives.map((objective) => <li key={objective.id}><input type="checkbox" checked={objective.complete} readOnly tabIndex={-1} aria-label={objective.label} /><span>{objective.label}</span></li>)}</ul>
    {/* Whatever the NPC still offers (e.g. Pay after saying goodbye before paying) stays one click away. */}
    <NpcActions state={state} anchorId={summary.npc.anchorId} pending={pending} onAction={onAction} onClose={onClose} onEnd={onClose} />
    <div className="result-actions">
      <button className="button primary" disabled={pending} onClick={onClose}>Back to the world</button>
    </div>
  </section>;
}
