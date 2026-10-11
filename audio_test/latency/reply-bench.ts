import { baselineTurnContext, type TurnContext } from '@vibequest/shared';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../../apps/server/src/config.js';
import { createGeminiDialogueProvider } from '../../apps/server/src/providers/gemini/live.js';
import { createElevenLabsSpeechProvider, voiceFor } from '../../apps/server/src/providers/elevenlabs/live.js';

const config = loadConfig(process.env);
if (!config.geminiApiKey || !config.elevenlabsApiKey) throw new Error('Both provider keys are required');
const dialogue = createGeminiDialogueProvider({ apiKey: config.geminiApiKey, model: config.geminiModel });
const speech = createElevenLabsSpeechProvider({ apiKey: config.elevenlabsApiKey, ttsModel: config.elevenlabsTtsModel, sttModel: config.elevenlabsSttModel, voiceIds: config.voiceIds });
const boss: TurnContext = {
  missionId: 'B1', mode: 'boss', tier: 1, npcId: 'laozhou',
  persona: 'Busy, formal ticket agent; Mandarin Chinese.', patience: 3,
  allowedIntents: ['buy_ticket', 'confirm_ticket', 'request_repeat', 'greeting', 'unknown'],
  facts: { haigangFare: '15 CNY' }, history: [],
};
const cases = [
  { id: 'tea', text: '请给我一杯茶。', context: baselineTurnContext },
  { id: 'coffee', text: '我想买一杯咖啡。如果没有咖啡，我可以买什么？多少钱？', context: baselineTurnContext },
  { id: 'ticket', text: '我要一张去海港的票。', context: boss },
];
const root = 'audio_test/latency/reply';
mkdirSync(root, { recursive: true });
writeFileSync(`${root}/inputs.json`, JSON.stringify(cases, null, 2));
const results: Record<string, unknown>[] = [];
console.log(JSON.stringify({ gemini: config.geminiModel, tts: config.elevenlabsTtsModel }));
for (let trial = 1; trial <= 3; trial++) {
  for (const sample of trial % 2 ? cases : [...cases].reverse()) {
    const start = performance.now();
    let geminiMs: number | undefined;
    try {
      const evaluation = await dialogue.evaluate(sample.context, sample.text);
      geminiMs = performance.now() - start;
      const ttsStart = performance.now();
      const audio = await speech.synthesize(evaluation.replyZh, sample.context.npcId);
      const complete = performance.now();
      const file = `${root}/${sample.id}-${trial}.mp3`;
      writeFileSync(file, audio);
      const durationSeconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' }).trim());
      const result = { id: sample.id, trial, geminiModel: config.geminiModel, ttsModel: config.elevenlabsTtsModel,
        npc: sample.context.npcId, voiceId: voiceFor(config.voiceIds, sample.context.npcId), input: sample.text,
        geminiMs: Math.round(geminiMs), ttsMs: Math.round(complete - ttsStart), combinedMs: Math.round(complete - start),
        replyZh: evaluation.replyZh, chars: evaluation.replyZh.length, durationSeconds, file, evaluation };
      results.push(result); console.log(JSON.stringify({ ...result, evaluation: undefined }));
    } catch (error) {
      const result = { id: sample.id, trial, geminiMs: geminiMs ? Math.round(geminiMs) : undefined,
        elapsedMs: Math.round(performance.now() - start), stage: geminiMs === undefined ? 'gemini' : 'tts',
        error: (error as { code?: string }).code ?? 'PROVIDER_ERROR' };
      results.push(result); console.log(JSON.stringify(result));
    }
    writeFileSync(`${root}/results.json`, JSON.stringify(results, null, 2));
  }
}
