import { useEffect, useState } from 'react';
import { useSpeechMouth } from '../audio/speech-mouth';
import type { NpcTarget } from './ConversationCard';
import type { PublicState } from '@vibequest/shared';

const emotions = ['happy', 'sad', 'angry'] as const;
const mouths = ['closed', 'half-open', 'open'] as const;
const path = (emotion: string, mouth: string) => `/assets/portraits/laowang/laowang-${emotion}-${mouth}.png`;
/** Identity is authoritative; the exact legacy label fallback supports older in-memory sessions. */
export function isLaoWang(npc: NpcTarget): boolean {
  return npc.nameKey ? npc.nameKey === 'laowang' : npc.role === 'vendor' && npc.name === '老王';
}
export function portraitEmotion(mood: PublicState['npcMood'][keyof PublicState['npcMood']]) {
  return mood === 'terse' ? 'angry' : mood === 'disengaged' ? 'sad' : 'happy';
}
export function NpcPortrait({ npc, mood }: { npc: NpcTarget; mood: PublicState['npcMood'][keyof PublicState['npcMood']] }) {
  const mouth = useSpeechMouth();
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(media.matches); media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    // Load once a conversation opens, not nine large images on the welcome screen.
    void Promise.all(emotions.flatMap((emotion) => mouths.map((mouth) => new Promise<void>((resolve) => {
      const image = new Image(); image.onload = () => resolve(); image.onerror = () => resolve(); image.src = path(emotion, mouth);
    })))).then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  const emotion = portraitEmotion(mood);
  if (!isLaoWang(npc) || failed) return null;
  return <div className="npc-portrait" aria-hidden="true" data-testid="npc-portrait" data-emotion={emotion} data-mouth={ready && !reduced ? mouth : 'closed'}>
    <img src={path(emotion, ready && !reduced ? mouth : 'closed')} alt="" onError={() => setFailed(true)} draggable={false} />
  </div>;
}
