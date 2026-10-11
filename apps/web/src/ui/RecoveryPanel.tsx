import type { UiProblem } from '../app/use-session';

export function RecoveryPanel({ problem, pending, onRetry, onRefresh, onNew, onDismiss }: { problem: UiProblem | null; pending: boolean; onRetry: () => Promise<void>; onRefresh: () => Promise<void>; onNew: () => void; onDismiss: () => void }) {
  if (!problem) return null;
  return <aside className="recovery-panel" role="alert" data-testid="recovery-panel"><strong>{problem.expired ? 'This session has expired.' : problem.code === 'STALE_VERSION' || problem.code === 'STALE_STATE' ? 'Your session needs a refresh.' : 'The request needs attention.'}</strong><p>{problem.message}</p><code>{problem.code}</code>
    <div>{problem.retryable && !problem.expired && <button className="button secondary" disabled={pending} onClick={() => void onRetry().catch(() => undefined)}>Retry request</button>}
      {!problem.expired && <button className="button secondary" disabled={pending} onClick={() => void onRefresh().catch(() => undefined)}>Refresh session</button>}
      {problem.expired && <button className="button primary" disabled={pending} onClick={onNew}>Start a fresh session</button>}
      <button className="button secondary" onClick={onDismiss}>Dismiss</button>
    </div>
  </aside>;
}
