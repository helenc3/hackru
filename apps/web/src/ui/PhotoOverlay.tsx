import { useEffect, useRef, useState } from 'react';
import { PHOTO_RULES, type PublicState, type RendererProps } from '@vibequest/shared';
import { capturePhoto } from '../world/photo-capture';

/**
 * Q3 photo flow after the server accepts a passerby's request: walk to the spot, start the
 * passerby's countdown, capture the world canvas, and acknowledge. The server verifies timing,
 * spot proximity, and the request; a failed capture returns to 'accepted' for a retry.
 */
export function PhotoOverlay({ state, pending, onAction }: { state: PublicState; pending: boolean; onAction: RendererProps['onAction'] }) {
  const photo = state.photo;
  const [now, setNow] = useState(Date.now);
  const [shot, setShot] = useState<{ requestId: string; dataUrl: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const sent = useRef<string | null>(null);
  const counting = photo?.status === 'countdown' && photo.countdownEndsAtMs !== undefined;
  useEffect(() => { if (!counting) return; const id = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(id); }, [counting]);
  useEffect(() => {
    if (!photo || photo.status !== 'countdown' || photo.countdownEndsAtMs === undefined) return;
    const key = `${photo.id}:${photo.attempts}`;
    if (sent.current === key) return;
    // ponytail: client clock vs server clock; the server allows a capture window, so a small skew only delays the shutter.
    const wait = Math.max(0, photo.countdownEndsAtMs - Date.now()) + 150;
    const timer = setTimeout(() => {
      sent.current = key;
      const viewpoint = state.interactables.find((item) => item.id === photo.viewpointAnchorId)?.position ?? photo.spot;
      void capturePhoto(photo.spot, viewpoint).then(
        ({ digest, dataUrl }) => { setShot({ requestId: photo.id, dataUrl }); setFailure(null); return onAction({ type: 'photoCapture', photoRequestId: photo.id, outcome: 'captured', imageDigest: digest }); },
        () => { setFailure('The photo did not come out. Step back on the spot and try again.'); return onAction({ type: 'photoCapture', photoRequestId: photo.id, outcome: 'failed' }); },
      ).catch(() => undefined);
    }, wait);
    return () => clearTimeout(timer);
  }, [photo?.id, photo?.status, photo?.attempts, photo?.countdownEndsAtMs]); // capture once per countdown

  if (!photo) return null;
  const distance = Math.hypot(state.position.x - photo.spot.x, state.position.z - photo.spot.z);
  const onSpot = distance <= PHOTO_RULES.spotRadius;
  const seconds = counting ? Math.max(0, Math.ceil((photo.countdownEndsAtMs! - now) / 1000)) : 0;
  return <section className="photo-overlay" aria-label="Photo at the Huangpu River" data-testid="photo-overlay" data-status={photo.status}>
    {(photo.status === 'accepted' || photo.status === 'failed') && <>
      <p><span lang="zh-Hans">好的！站在那边，江在你后面。</span> Stand on the photo spot with the river behind you.</p>
      {(failure || photo.status === 'failed') && <p role="alert">{failure ?? 'The last photo failed. Try again.'}</p>}
      <p>{onSpot ? 'You are on the spot.' : `Photo spot: ${distance.toFixed(0)} m away.`}</p>
      <button type="button" className="button primary" disabled={pending || !onSpot || state.status !== 'active'} onClick={() => void onAction({ type: 'choose', choiceId: 'q3.start-photo', anchorId: photo.viewpointAnchorId }).catch(() => undefined)}>Ready · start photo</button>
    </>}
    {photo.status === 'countdown' && <div className="photo-countdown" role="timer" aria-live="assertive"><span lang="zh-Hans">{seconds > 0 ? ['一', '二', '三'][seconds - 1] ?? seconds : '茄子！'}</span><strong>{seconds > 0 ? seconds : 'Cheese!'}</strong></div>}
    {photo.status === 'captured' && <figure className="photo-result" data-testid="photo-result">
      {shot?.requestId === photo.id && <img src={shot.dataUrl} alt="Your photo by the Huangpu River" />}
      <figcaption>Photo taken by the river.</figcaption>
    </figure>}
  </section>;
}
