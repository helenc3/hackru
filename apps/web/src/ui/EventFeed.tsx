import { useEffect, useRef, useState } from 'react';
import type { GameEvent } from '@vibequest/shared';

export const NOTICE_LIFETIME_MS = 5_000;

/** Expiry is measured from receipt, not from the most recent movement sync or render. */
export function EventFeed({ events }: { events: readonly GameEvent[] }) {
  const expires = useRef(new Map<string, number>());
  const [clock, setClock] = useState(0);
  const [visible, setVisible] = useState<GameEvent[]>([]);
  useEffect(() => {
    const now = Date.now();
    for (const event of events) if (!expires.current.has(event.id)) expires.current.set(event.id, now + NOTICE_LIFETIME_MS);
    const alive = events.filter((event) => expires.current.get(event.id)! > now).slice(-3);
    setVisible(alive);
    if (!alive.length) return;
    const remaining = Math.min(...alive.map((event) => expires.current.get(event.id)!)) - now;
    const timer = setTimeout(() => setClock((value) => value + 1), remaining);
    return () => clearTimeout(timer);
  }, [events, clock]);
  return visible.length > 0 ? <section className="event-feed" aria-label="Quest updates" aria-live="polite">{visible.map((event) => <p key={event.id}>{event.message}</p>)}</section> : null;
}

export function TimedNotice({ children }: { children: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => { const timer = setTimeout(() => setVisible(false), NOTICE_LIFETIME_MS); return () => clearTimeout(timer); }, []);
  return visible ? <p className="thread-notice" role="status">{children}</p> : null;
}
