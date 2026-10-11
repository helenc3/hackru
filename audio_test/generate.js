// node --env-file-if-exists=.env audio_test/generate.js
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY is required');
const model = 'eleven_v4';
const { voices } = JSON.parse(readFileSync(`${root}voices.json`, 'utf8'));
const inputs = JSON.parse(readFileSync(`${root}inputs.json`, 'utf8'));
const manifestPath = `${root}manifest.json`;
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
const slug = (voice) => `${voice.name.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}-${voice.voiceId}`;
let stop = false;
let done = 0;
async function generate(voice, input, option) {
  const file = `${input.assetId}/${slug(voice)}_${option.option}.mp3`;
  const old = manifest.find((entry) => entry.file === file);
  if (old?.status === 'generated' && existsSync(root + file) && old.text === option.text && old.model === model) { done++; return; }
  const started = Date.now();
  const entry = { file, assetId: input.assetId, voiceId: voice.voiceId, voiceName: voice.name, accent: voice.accent, option: option.option, format: option.format, text: option.text, model, languageCode: 'zh', status: 'pending' };
  const request = () => fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text: option.text, model_id: model, language_code: 'zh' }),
    signal: AbortSignal.timeout(60000),
  });
  try {
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await request();
      if (response.status !== 429 && response.status < 500) break;
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 2000));
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      entry.status = 'failed'; entry.httpStatus = response.status;
      entry.errorCode = body.detail?.status ?? 'provider_error';
      if (['quota_exceeded', 'insufficient_credits', 'invalid_api_key', 'missing_permissions'].includes(entry.errorCode)) stop = true;
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 1000) throw new Error('empty_audio');
      mkdirSync(`${root}${input.assetId}`, { recursive: true });
      writeFileSync(root + file, bytes);
      Object.assign(entry, { status: 'generated', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), generatedAt: new Date().toISOString() });
    }
  } catch (error) { entry.status = 'failed'; entry.errorCode = error.name === 'TimeoutError' ? 'timeout' : 'request_failed'; }
  entry.elapsedMs = Date.now() - started;
  const index = manifest.findIndex((item) => item.file === file);
  if (index < 0) manifest.push(entry); else manifest[index] = entry;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  done++;
  console.log(`${done}/${jobs.length} ${entry.status} ${file}${entry.errorCode ? ' ' + entry.errorCode : ''}`);
}
const jobs = voices.flatMap((voice) => inputs.flatMap((input) => input.options.map((option) => ({ voice, input, option }))));
let next = 0;
async function worker() { while (!stop && next < jobs.length) { const job = jobs[next++]; await generate(job.voice, job.input, job.option); } }
await Promise.all([worker(), worker()]);
const generated = manifest.filter((entry) => entry.status === 'generated').length;
console.log(`Complete: ${generated}/${jobs.length} generated; ${manifest.filter((entry) => entry.status === 'failed').length} failed; stopped=${stop}`);
if (generated !== jobs.length) process.exitCode = 1;
