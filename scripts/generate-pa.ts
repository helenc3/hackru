// Generates Mandarin PA/directions clips for every cue audioAssetId.
// Run: node --env-file-if-exists=.env --import tsx scripts/generate-pa.ts [--force] [--verify]
// --verify transcribes each clip with scribe_v2 (zh) and prints a machine round-trip comparison.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { cues } from '@vibequest/shared';
import { APPROVED_VOICE_IDS, DEFAULT_PA_VOICE_ID, DEFAULT_VOICE_IDS, voiceFor } from '../apps/server/src/providers/elevenlabs/live.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const audioDir = `${root}apps/web/public/audio`;
const manifestPath = `${root}fixtures/audio/pa-manifest.json`;
// Use reviewed character voices and authored Hanzi directly.
const paVoiceId = process.env.ELEVENLABS_VOICE_PA || DEFAULT_PA_VOICE_ID;
const directionsVoiceId = voiceFor({ xiaolin: process.env.ELEVENLABS_VOICE_XIAOLIN }, 'xiaolin');
const setupVoiceId = process.env.ELEVENLABS_VOICE_SETUP || DEFAULT_VOICE_IDS.xiaolin;
for (const voiceId of [paVoiceId, setupVoiceId]) {
  if (!APPROVED_VOICE_IDS.has(voiceId)) throw new Error('Choose a human-approved voice from docs/MANDARIN_VOICES.md.');
}
const model = process.env.ELEVENLABS_PA_MODEL || 'eleven_v4';
const force = process.argv.includes('--force');
const verify = process.argv.includes('--verify');

if (!process.env.ELEVENLABS_API_KEY) {
  console.error('ELEVENLABS_API_KEY is not set.');
  process.exit(2);
}
const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

const assets = [...cues.flatMap((cue) => cue.variants.flatMap((variant) => variant.audioAssetId
  ? [{ audioAssetId: variant.audioAssetId, cueId: cue.id, tier: variant.tier, textZh: variant.textZh, englishMeaning: variant.englishMeaning }]
  : [])), { audioAssetId: 'rutgers-university-zh', cueId: 'setup.audio-check', tier: null, textZh: '罗格斯大学。', englishMeaning: 'Rutgers University.' }];

mkdirSync(audioDir, { recursive: true });
mkdirSync(`${root}fixtures/audio`, { recursive: true });
let characters = 0;
const manifest = [];
const previousManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) as { audioAssetId: string; voiceId: string; model: string; synthesisText?: string }[] : [];
for (const asset of assets) {
  const voiceId = asset.cueId === 'setup.audio-check' ? setupVoiceId : asset.cueId === 'p1.station-directions' ? directionsVoiceId : paVoiceId;
  const synthesisText = asset.textZh;
  if (/[0-9]/.test(asset.textZh)) console.warn(`WARN ${asset.audioAssetId}: Arabic digits in spoken text; use Chinese numerals.`);
  const file = `${audioDir}/${asset.audioAssetId}.mp3`;
  const previous = previousManifest.find((entry) => entry.audioAssetId === asset.audioAssetId);
  if (force || !existsSync(file) || previous?.voiceId !== voiceId || previous?.model !== model || previous?.synthesisText !== synthesisText) {
    const stream = await client.textToSpeech.convert(voiceId, { text: synthesisText, modelId: model, languageCode: 'zh', outputFormat: 'mp3_44100_128' });
    writeFileSync(file, new Uint8Array(await new Response(stream).arrayBuffer()));
    characters += synthesisText.length;
    console.log(`generated ${asset.audioAssetId}`);
  }
  const bytes = readFileSync(file);
  // mp3_44100_128 is constant bitrate: 128 kbit/s => bytes * 8 / 128 ms.
  manifest.push({ ...asset, synthesisText, voiceId, model, bytes: bytes.length, estDurationMs: Math.round((bytes.length * 8) / 128), sha256: createHash('sha256').update(bytes).digest('hex'), review: 'pending' });
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${manifest.length} assets, ${characters} characters synthesized this run.`);

if (verify) {
  const strip = (text: string) => text.replace(/[\s，。：、！？,.:!?]/g, '');
  for (const asset of manifest) {
    const result = await client.speechToText.convert({ modelId: 'scribe_v2', languageCode: 'zh', diarize: false, file: new Blob([readFileSync(`${audioDir}/${asset.audioAssetId}.mp3`)], { type: 'audio/mpeg' }) });
    const heard = 'text' in result ? result.text : '';
    console.log(`${strip(heard) === strip(asset.textZh) ? 'EXACT' : 'DIFF '} ${asset.audioAssetId}\n  expected: ${asset.textZh}\n  heard:    ${heard}`);
  }
}
