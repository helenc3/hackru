import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../../apps/server/src/config.js';
import { voiceFor } from '../../apps/server/src/providers/elevenlabs/live.js';

const config = loadConfig(process.env);
if (!config.elevenlabsApiKey) throw new Error('ELEVENLABS_API_KEY is not set');
const client = new ElevenLabsClient({ apiKey: config.elevenlabsApiKey });
const root = 'audio_test/latency/tts';
mkdirSync(root, { recursive: true });
const voiceId = voiceFor(config.voiceIds, 'achen');
const cases = [
  { id: 'brief', text: '好的。' },
  { id: 'typical', text: '去江滨的列车改到三号站台了。售票处在右边，车票十五元，请先买票。' },
  { id: 'long', text: '别紧张，列车还有十分钟才出发。请先到右边的售票处买票，票价十五元。去江滨的列车现在从三号站台发车，不是二号站台。如果走错站台，请向工作人员求助。' },
];
if (cases.some(c => c.text.length > 80)) throw new Error('Input exceeds current provider limit');
const results: Record<string, unknown>[] = [];
console.log(JSON.stringify({ model: config.elevenlabsTtsModel, voiceId, cases }));
for (let trial = 1; trial <= 3; trial++) {
  for (const sample of trial % 2 ? cases : [...cases].reverse()) {
    const started = performance.now();
    try {
      const stream = await client.textToSpeech.convert(voiceId, {
        text: sample.text, modelId: config.elevenlabsTtsModel,
        outputFormat: 'mp3_44100_128', languageCode: 'zh',
      }, { timeoutInSeconds: 5, maxRetries: 0 });
      const headersMs = performance.now() - started;
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let firstAudioMs: number | undefined;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value.length) { firstAudioMs ??= performance.now() - started; chunks.push(value); }
      }
      const completeMs = performance.now() - started;
      const audio = Buffer.concat(chunks);
      const file = `${root}/${sample.id}-${trial}.mp3`;
      writeFileSync(file, audio);
      const durationSeconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' }).trim());
      const result = { id: sample.id, trial, text: sample.text, chars: sample.text.length,
        model: config.elevenlabsTtsModel, voiceId, headersMs: Math.round(headersMs),
        firstAudioMs: Math.round(firstAudioMs ?? 0), completeMs: Math.round(completeMs),
        audioBytes: audio.length, durationSeconds, file };
      results.push(result); console.log(JSON.stringify(result));
    } catch {
      const result = { id: sample.id, trial, elapsedMs: Math.round(performance.now() - started), error: 'TTS request failed' };
      results.push(result); console.log(JSON.stringify(result));
    }
    writeFileSync(`${root}/results.json`, JSON.stringify(results, null, 2));
  }
}
