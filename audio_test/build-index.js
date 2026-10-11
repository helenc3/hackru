import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const { voices } = JSON.parse(readFileSync(root + 'voices.json', 'utf8'));
const inputs = JSON.parse(readFileSync(root + 'inputs.json', 'utf8'));
const manifest = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const rows = (assetId) => voices.map((voice, index) => `<tr><td>${index + 1}. ${escape(voice.name)}<br><small>${escape(voice.accent)} · ${voice.usageCharacters1y.toLocaleString()} characters/year</small></td>${[1, 2, 3].map((option) => {
  const entry = manifest.find((item) => item.assetId === assetId && item.voiceId === voice.voiceId && item.option === option);
  return `<td>${entry?.status === 'generated' ? `<audio controls preload="none" src="${encodeURI(entry.file)}"></audio><br><a href="${encodeURI(entry.file)}">MP3</a>` : escape(entry?.errorCode ?? 'Pending')}</td>`;
}).join('')}</tr>`).join('\n');
writeFileSync(root + 'index.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mandarin voice comparison</title><style>body{font:16px system-ui;margin:32px;line-height:1.5;background:#f5f5f5;color:#222}table{border-collapse:collapse;width:100%;background:white}td,th{border:1px solid #ddd;padding:12px;text-align:left}audio{width:240px}small{color:#555}details{margin:16px 0}code{white-space:pre-wrap}section{margin:48px 0}</style><h1>Mandarin voice comparison</h1><p>20 Chinese-labeled voices ranked by annual ElevenLabs usage. Model: eleven_v4. Options: 1 Hanzi; 2 tone-marked pinyin; 3 inline IPA.</p><p>These are listening experiments, not pronunciation-approved recordings. <a href="manifest.json">Generation manifest</a> · <a href="inputs.json">Exact inputs</a> · <a href="voices.json">Voice ranking</a></p>${inputs.map((input) => `<section><h2>${escape(input.assetId)}</h2>${input.options.map((option) => `<details><summary>Option ${option.option}: ${escape(option.format)}</summary><code>${escape(option.text)}</code></details>`).join('')}<div style="overflow:auto"><table><thead><tr><th>Voice</th><th>1 — Hanzi</th><th>2 — Pinyin</th><th>3 — IPA</th></tr></thead><tbody>${rows(input.assetId)}</tbody></table></div></section>`).join('')}</html>`);
console.log('Built audio_test/index.html');
