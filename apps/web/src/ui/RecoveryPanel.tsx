import { Button, Card } from './primitives';
import type { UiProblem } from '../app/use-session';

export function RecoveryPanel({ problem, pending, onRetry, onRefresh, onNew, onDismiss }: { problem: UiProblem | null; pending: boolean; onRetry: () => Promise<void>; onRefresh: () => Promise<void>; onNew: () => void; onDismiss: () => void }) {
  if (!problem) return null;
  return <Card asChild><aside className="recovery-panel" role="alert" data-testid="recovery-panel"><strong>{problem.expired ? 'This session has expired.' : problem.code === 'STALE_VERSION' || problem.code === 'STALE_STATE' ? 'Your session needs a refresh.' : 'The request needs attention.'}</strong><p>{problem.message}</p><code>{problem.code}</code>
    <div>{problem.retryable && !problem.expired && <Button className="button secondary" disabled={pending} onClick={() => void onRetry().catch(() => undefined)}>Retry request</Button>}
      {!problem.expired && <Button className="button secondary" disabled={pending} onClick={() => void onRefresh().catch(() => undefined)}>Refresh session</Button>}
      {problem.expired && <Button className="button primary" disabled={pending} onClick={onNew}>Start a fresh session</Button>}
      <Button className="button secondary" onClick={onDismiss}>Dismiss</Button>
    </div>
  </aside></Card>;
}
