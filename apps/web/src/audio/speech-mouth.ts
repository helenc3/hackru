import { useSyncExternalStore } from 'react';

export type Mouth = 'closed' | 'half-open' | 'open';
let mouth: Mouth = 'closed';
let owner: symbol | null = null;
const listeners = new Set<() => void>();
function publish(next: Mouth) {
  if (mouth === next) return;
  mouth = next; listeners.forEach((listener) => listener());
}
export function mouthForLevel(rms: number): Mouth {
  return rms < .012 ? 'closed' : rms < .075 ? 'half-open' : 'open';
}
export function useSpeechMouth(): Mouth {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => mouth);
}

/** Observe only outgoing NPC audio, at most ten image swaps/sec. Older lanes cannot reset a newer lane. */
function watch(level: () => number) {
  const token = Symbol('npc-audio'); owner = token;
  let frame = 0, last = -Infinity;
  const tick = (now: number) => {
    if (owner !== token) return;
    if (now - last >= 100) { last = now; publish(mouthForLevel(level())); }
    frame = requestAnimationFrame(tick);
  };
  publish('closed'); frame = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(frame); if (owner === token) { owner = null; publish('closed'); } };
}
export function rms(samples: ArrayLike<number>): number {
  let energy = 0;
  for (let i = 0; i < samples.length; i++) energy += samples[i]! ** 2;
  return samples.length ? Math.sqrt(energy / samples.length) : 0;
}

/** Tap the existing live output graph; never connect the player's microphone to this analyser. */
export function watchLiveSpeech(ctx: AudioContext): { connect(node: AudioBufferSourceNode): void; stop(): void } {
  if (!ctx.createAnalyser) return { connect() {}, stop() {} };
  const analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
  const samples = new Float32Array(analyser.fftSize);
  const stop = watch(() => { if (ctx.state !== 'running') return 0; analyser.getFloatTimeDomainData(samples); return rms(samples); });
  return { connect(node) { node.connect(analyser); }, stop() { stop(); analyser.disconnect(); } };
}

/** Decode an envelope off the playback path: no rerouting HTML audio or delaying its start. */
export function watchClipSpeech(player: HTMLAudioElement, clip: Blob): () => void {
  let disposed = false, stop = () => {}, context: AudioContext | null = null;
  void (async () => {
    try {
      if (typeof AudioContext === 'undefined') return;
      context = new AudioContext();
      if (!context.decodeAudioData) return;
      const audio = await context.decodeAudioData(await clip.arrayBuffer());
      if (disposed) return;
      const samples = audio.getChannelData(0), bin = Math.max(1, Math.round(audio.sampleRate / 10));
      const envelope = Array.from({ length: Math.ceil(samples.length / bin) }, (_, i) => rms(samples.subarray(i * bin, (i + 1) * bin)));
      stop = watch(() => player.paused || player.ended || player.muted || player.volume === 0 ? 0 : envelope[Math.floor(player.currentTime * 10)] ?? 0);
    } catch { /* Mouth animation is optional; decoding must never break audible playback. */ }
    finally { void context?.close().catch(() => undefined); }
  })();
  return () => { disposed = true; stop(); };
}
