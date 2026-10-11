/**
 * Manual live acceptance (paid providers; never run by CI).
 *   npm run dev   # with GEMINI_API_KEY, ELEVENLABS_API_KEY and ENABLE_VALIDATION_HARNESS=true in .env
 *   npx tsx --env-file=.env tests/e2e/live-acceptance.ts [http://127.0.0.1:3001]
 * Drives the server's real loop per turn: recording phase → ElevenLabs STT upload → transcript
 * confirmation → Gemini turn → ElevenLabs reply speech. Player clips are synthesized Mandarin
 * (ElevenLabs TTS), so this measures provider latency but does not replace a microphone check.
 */
import { randomUUID } from 'node:crypto';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { PublicState } from '@vibequest/shared';

const base = process.argv[2] ?? 'http://127.0.0.1:3001';
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY is required to synthesize player clips.');
const eleven = new ElevenLabsClient({ apiKey: key });
const lines = ['你好！', '我要咖啡。', '那就茶吧。', '茶多少钱？', '茶十元，对吗？', '谢谢。', '车站怎么走？', '请再说一遍。', '售票处在右边吗？', '好的，再见。'];

let state!: PublicState;
let n = 0;
async function call(path: string, body?: object) {
  const response = await fetch(`${base}/api${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const json = await response.json() as { state?: PublicState; error?: { code: string } };
  if (json.state) state = json.state;
  if (!response.ok) throw new Error(`${path}: ${response.status} ${json.error?.code}`);
  return json;
}
const act = (action: object) => call(`/sessions/${state.sessionId}/actions`, { actionId: `live-${++n}`, expectedVersion: state.version, action });

await call('/sessions', { initialTier: 1, providerMode: 'live', validationMode: true, inputPreference: 'voice' });
await act({ type: 'moveZone', zoneId: 'cafe' });
await act({ type: 'inspect', targetId: 'p1.entrance-sign' });
await act({ type: 'choose', choiceId: 'p1.enter-plaza-door' });

const rows: { line: string; heard: string; reply: string; sttMs: number; geminiMs: number; ttsMs: number; totalMs: number }[] = [];
const failures: { line: string; error: string }[] = [];
for (const line of lines) try {
  const clip = new Uint8Array(await new Response(await eleven.textToSpeech.convert('EXAVITQu4vr4xnSDxMaL', { text: line, modelId: 'eleven_multilingual_v2', outputFormat: 'mp3_44100_128', languageCode: 'zh' })).arrayBuffer());
  const operationId = randomUUID();
  await act({ type: 'audioPhase', operationId, phase: 'recording' });
  await act({ type: 'audioPhase', operationId, phase: 'transcribing' });
  const stop = Date.now(); // "Stop" pressed: everything after this is provider/server latency.
  const form = new FormData();
  form.set('audio', new Blob([clip], { type: 'audio/mpeg' }), 'clip.mp3');
  form.set('operationId', operationId);
  const sttResponse = await fetch(`${base}/api/sessions/${state.sessionId}/transcriptions`, { method: 'POST', body: form });
  const stt = await sttResponse.json() as { text: string; transcriptionId: string; error?: { code: string } };
  if (!sttResponse.ok) throw new Error(`STT ${sttResponse.status} ${stt.error?.code}`);
  const sttMs = Date.now() - stop;
  await act({ type: 'audioPhase', operationId, phase: 'confirming' });
  await act({ type: 'audioPhase', operationId, phase: 'idle' }); // confirmation time is player time; excluded below
  const geminiStart = Date.now();
  const turn = await call(`/sessions/${state.sessionId}/turns`, { turnId: `live-${++n}`, expectedVersion: state.version, npcId: 'xiaolin', input: { text: stt.text, transcriptionId: stt.transcriptionId, source: 'stt' } }) as { npcReply: string; speechId: string };
  const geminiMs = Date.now() - geminiStart;
  const ttsStart = Date.now();
  for (;;) {
    const speech = await fetch(`${base}/api/sessions/${state.sessionId}/speech/${turn.speechId}`);
    if (speech.status === 200) { await speech.arrayBuffer(); break; }
    if (speech.status !== 202) throw new Error(`TTS ${speech.status}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const ttsMs = Date.now() - ttsStart;
  await act({ type: 'audioPhase', operationId: turn.speechId, phase: 'playing' });
  await act({ type: 'audioPhase', operationId: turn.speechId, phase: 'idle' });
  rows.push({ line, heard: stt.text, reply: turn.npcReply, sttMs, geminiMs, ttsMs, totalMs: sttMs + geminiMs + ttsMs });
  console.log(rows.at(-1));
  await new Promise((resolve) => setTimeout(resolve, 6_500)); // stay under the 10 turns/minute cap
} catch (error) {
  // Record and continue: an outage is an observation, not a reason to discard measured turns.
  failures.push({ line, error: (error as Error).message });
  console.log(failures.at(-1));
  await call(`/sessions/${state.sessionId}`);
}
const totals = rows.map((row) => row.totalMs).sort((a, b) => a - b);
console.table(rows);
console.log({ turns: rows.length, failures, medianMs: totals[Math.floor(totals.length / 2)], maxMs: totals.at(-1), status: state.status, objectives: state.objectives.map((o) => `${o.complete ? '✓' : '·'} ${o.label}`) });
