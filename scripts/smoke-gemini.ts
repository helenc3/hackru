// Live Gemini acceptance smoke: one practice and one boss structured-output call.
// Run: node --env-file-if-exists=.env --import tsx scripts/smoke-gemini.ts
// Prints only classification results; never the key or raw response.
import { baselineTurnContext, type TurnContext } from '@vibequest/shared';
import { meetsProgressionGate } from '../apps/server/src/providers/gemini/gate.js';
import { createGeminiDialogueProvider } from '../apps/server/src/providers/gemini/live.js';

const apiKey = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set; live smoke cannot run.');
  process.exit(2);
}

const bossContext: TurnContext = {
  missionId: 'B1', mode: 'boss', tier: 1, npcId: 'laozhou', persona: 'Busy, formal ticket agent; Mandarin Chinese.', patience: 3,
  allowedIntents: ['buy_ticket', 'confirm_ticket', 'request_repeat', 'greeting', 'unknown'], facts: { haigangFare: '15 CNY' }, history: [],
};
const cases = [
  { label: 'practice P1 xiaolin', context: baselineTurnContext, text: '请给我一杯茶。', intent: 'order_drink' },
  { label: 'boss B1 laozhou', context: bossContext, text: '我要一张去海港的票。', intent: 'buy_ticket' },
] as const;

const provider = createGeminiDialogueProvider({ apiKey, model });
let failed = false;
console.log(`model=${model}`);
for (const { label, context, text, intent } of cases) {
  const started = Date.now();
  try {
    const result = await provider.evaluate(context, text);
    const pass = result.intent === intent && meetsProgressionGate(result) && (context.mode !== 'boss' || result.coach === null);
    failed ||= !pass;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${label}: intent=${result.intent} slots=${JSON.stringify(result.slots)} coachNull=${result.coach === null} ${Date.now() - started}ms`);
  } catch (error) {
    failed = true;
    const { code, message } = error as { code?: string; message?: string };
    console.log(`FAIL ${label}: ${code ?? 'ERROR'} ${message ?? ''} ${Date.now() - started}ms`);
  }
}
process.exit(failed ? 1 : 0);
