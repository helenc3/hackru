// Live ElevenLabs proof: Mandarin TTS per NPC, then scribe_v2 STT of that audio.
// Run: node --env-file-if-exists=.env --import tsx scripts/smoke-elevenlabs.ts
// Prints voice IDs, sizes, latency and transcripts only; never the API key.
import type { NpcId } from '@vibequest/shared';
import { loadConfig } from '../apps/server/src/config.js';
import { createElevenLabsSpeechProvider, DEFAULT_VOICE_IDS, voiceFor, mp3DurationMs } from '../apps/server/src/providers/elevenlabs/live.js';

const lines: Record<NpcId, { text: string; terms: string[] }> = {
  xiaolin: { text: '好的，一杯茶，十元。', terms: ['茶', '十'] },
  achen: { text: '去江滨的车在三号站台。', terms: ['江滨', '三号'] },
  laozhou: { text: '一张去海港的票，十五元。', terms: ['海港', '十五'] },
};

const config = loadConfig(process.env);
if (!config.elevenlabsApiKey) {
  console.log('ELEVENLABS_API_KEY is not set.');
  process.exit(2);
}
const speech = createElevenLabsSpeechProvider({ apiKey: config.elevenlabsApiKey, ttsModel: config.elevenlabsTtsModel, sttModel: config.elevenlabsSttModel, voiceIds: config.voiceIds });
console.log(`tts=${config.elevenlabsTtsModel} stt=${config.elevenlabsSttModel}`);

let failed = false;
for (const npc of Object.keys(lines) as NpcId[]) {
  const { text, terms } = lines[npc];
  const voice = voiceFor(config.voiceIds, npc);
  const label = `${npc} voice=${voice}${voice === DEFAULT_VOICE_IDS[npc] ? ' (default)' : ''}`;
  let started = Date.now();
  let audio: Uint8Array;
  try {
    audio = await speech.synthesize(text, npc);
  } catch (error) {
    failed = true;
    console.log(`FAIL tts ${label}: ${(error as { code?: string }).code ?? 'error'} ${Date.now() - started}ms`);
    continue;
  }
  const ttsMs = Date.now() - started;
  started = Date.now();
  try {
    const heard = await speech.transcribe(audio, 'audio/mpeg');
    const kept = terms.filter((term) => heard.includes(term));
    console.log(`PASS tts ${label}: ${audio.length} bytes ~${mp3DurationMs(audio)}ms audio, ${ttsMs}ms`);
    console.log(`${kept.length === terms.length ? 'PASS' : 'WARN'} stt ${npc}: "${heard}" (sent "${text}") terms ${kept.length}/${terms.length} ${Date.now() - started}ms`);
  } catch (error) {
    failed = true;
    console.log(`PASS tts ${label}: ${audio.length} bytes, ${ttsMs}ms`);
    console.log(`FAIL stt ${npc}: ${(error as { code?: string }).code ?? 'error'} ${Date.now() - started}ms`);
  }
}
process.exit(failed ? 1 : 0);
