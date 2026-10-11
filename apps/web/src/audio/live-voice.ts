import { TurnResponseSchema, type TurnResponse } from '@vibequest/shared';
import { setAudioActivity } from './audio-bus';

/**
 * Real-time voice lane: mic PCM16/16 kHz up a WebSocket, NPC PCM16/24 kHz back.
 * The server owns VAD, turn detection and evaluation; this only moves audio and text.
 */
export type LiveStatus = 'connecting' | 'live' | 'npc-speaking' | 'paused' | 'ended' | 'unavailable' | 'error';
export type LiveEvent =
  | { kind: 'status'; status: LiveStatus; message?: string; retryable?: boolean }
  | { kind: 'player' | 'npc'; text: string; final: boolean }
  | { kind: 'turn'; turn: TurnResponse };
export type LiveHandle = { stop(): void; pause(on: boolean): void };

const INPUT_RATE = 16_000;
const FRAME_SAMPLES = 640; // 40 ms at 16 kHz
const WORKLET = URL.createObjectURL(new Blob([
  'class P extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice());return true}}registerProcessor("vq-capture",P)',
], { type: 'application/javascript' }));

function b64ToInt16(data: string): Int16Array {
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  return new Int16Array(bytes.buffer, 0, bytes.byteLength >> 1);
}

export function startLiveVoice(sessionId: string, npcId: string, listener: (event: LiveEvent) => void): LiveHandle {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}/api/sessions/${encodeURIComponent(sessionId)}/live?npcId=${encodeURIComponent(npcId)}`);
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let ready = false, stopped = false, paused = false, speaking = false;
  let cursor = 0;
  const playing = new Set<AudioBufferSourceNode>();
  let pending = new Float32Array(0);
  let position = 0; // fractional read index into `pending` for resampling
  // A disposed instance (StrictMode remount, panel close) never speaks again; only the terminal status after stop() may.
  const emit = (event: LiveEvent, terminal = false) => { if (!stopped || terminal) listener(event); };
  const status = (next: LiveStatus, extra: Partial<Extract<LiveEvent, { kind: 'status' }>> = {}) => emit({ kind: 'status', status: next, ...extra }, ['unavailable', 'ended'].includes(next));

  function pushCapture(chunk: Float32Array, sourceRate: number) {
    if (paused || ws.readyState !== WebSocket.OPEN) return;
    const merged = new Float32Array(pending.length + chunk.length);
    merged.set(pending); merged.set(chunk, pending.length);
    pending = merged;
    const step = sourceRate / INPUT_RATE;
    const count = Math.floor((pending.length - 1 - position) / step);
    if (count < FRAME_SAMPLES) return;
    const out = new Int16Array(count);
    for (let i = 0; i < count; i++) {
      const at = position + i * step, index = Math.floor(at), frac = at - index;
      const sample = pending[index]! * (1 - frac) + pending[index + 1]! * frac; // linear interpolation
      out[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    }
    position += count * step;
    const keep = Math.floor(position);
    pending = pending.slice(keep); position -= keep;
    ws.send(out.buffer);
  }

  async function openMic() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (stopped) { for (const track of stream.getTracks()) track.stop(); return; }
    ctx = new AudioContext();
    await ctx.resume().catch(() => undefined);
    const source = ctx.createMediaStreamSource(stream);
    const rate = ctx.sampleRate;
    if (ctx.audioWorklet) {
      await ctx.audioWorklet.addModule(WORKLET);
      const node = new AudioWorkletNode(ctx, 'vq-capture');
      node.port.onmessage = (event: MessageEvent<Float32Array>) => pushCapture(event.data, rate);
      source.connect(node);
    } else {
      // ponytail: ScriptProcessor is deprecated but still everywhere; only reached when AudioWorklet is missing.
      const node = ctx.createScriptProcessor(1024, 1, 1);
      node.onaudioprocess = (event) => pushCapture(event.inputBuffer.getChannelData(0).slice(), rate);
      source.connect(node); node.connect(ctx.destination);
    }
    setAudioActivity('recording');
    status('live');
  }

  function play(samples: Int16Array, rate: number) {
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, samples.length, rate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i]! / 32768;
    const node = ctx.createBufferSource();
    node.buffer = buffer; node.connect(ctx.destination);
    const start = Math.max(ctx.currentTime, cursor);
    node.start(start); cursor = start + buffer.duration;
    playing.add(node);
    node.onended = () => { playing.delete(node); if (playing.size === 0 && speaking && !stopped) { speaking = false; status('live'); } };
    if (!speaking) { speaking = true; status('npc-speaking'); }
  }

  function flush() {
    for (const node of playing) { node.onended = null; try { node.stop(); } catch { /* already ended */ } }
    playing.clear(); cursor = 0;
    if (speaking) { speaking = false; status('live'); }
  }

  let sampleRate = 24_000;
  ws.onmessage = (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as { type: string; [key: string]: unknown };
    switch (message.type) {
      case 'ready': ready = true; sampleRate = Number(message.sampleRate) || 24_000; void openMic().catch((error: unknown) => {
        const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
        stop(); status('unavailable', { message: denied ? 'Microphone access was blocked.' : 'The microphone could not be opened.' });
      }); break;
      case 'audio': play(b64ToInt16(String(message.data)), sampleRate); break;
      case 'interrupted': flush(); break;
      case 'playerTranscript': emit({ kind: 'player', text: String(message.text), final: Boolean(message.final) }); break;
      case 'npcTranscript': emit({ kind: 'npc', text: String(message.text), final: Boolean(message.final) }); break;
      case 'turn': { const parsed = TurnResponseSchema.safeParse(message.turn); if (parsed.success) emit({ kind: 'turn', turn: parsed.data }); break; }
      case 'error': status('error', { message: String(message.message), retryable: Boolean(message.retryable) }); break;
      case 'closed': stop(); status('ended'); break;
      default: break;
    }
  };
  ws.onclose = (event) => { if (stopped) return; stop(); status(!ready || event.code >= 4000 ? 'unavailable' : 'ended'); };
  ws.onerror = () => { /* onclose follows with the code */ };

  function stop() {
    if (stopped) return;
    stopped = true;
    flush();
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }));
    ws.close();
    if (stream) for (const track of stream.getTracks()) track.stop();
    void ctx?.close().catch(() => undefined);
    setAudioActivity('idle');
  }

  return {
    stop,
    pause(on) { paused = on; status(on ? 'paused' : speaking ? 'npc-speaking' : 'live'); },
  };
}
