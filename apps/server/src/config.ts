import { characterDescriptions, type NpcId } from '@vibequest/shared';
import { z } from 'zod';

const booleanEnvironmentSchema = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  ANTHROPIC_API_KEY: z.string().trim().min(1).optional(),
  ANTHROPIC_MODEL: z.string().trim().min(1).default('claude-opus-5-5'),
  GEMINI_API_KEY: z.string().trim().min(1).optional(),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-3.8-flash'),
  GEMINI_LIVE_MODEL: z.string().trim().min(1).default('gemini-3.8-live'),
  ELEVENLABS_API_KEY: z.string().trim().min(1).optional(),
  ELEVENLABS_TTS_MODEL: z.string().trim().min(1).default('eleven_v4_turbo'),
  ELEVENLABS_PA_MODEL: z.string().trim().min(1).default('eleven_v4'),
  ELEVENLABS_STT_MODEL: z.string().trim().min(1).default('scribe_v2'),
  ENABLE_DEMO_FIXTURES: booleanEnvironmentSchema,
  E2E_FAST_MOVEMENT: booleanEnvironmentSchema,
  ENABLE_VALIDATION_HARNESS: booleanEnvironmentSchema,
  /** Claude city composition is opt-in; without it the seeded fallback generator builds every chunk. */
  ENABLE_CLAUDE_CITY: booleanEnvironmentSchema,
  /** Measured: claude-sonnet-5-5 composes a valid chunk in ~10.5 s; opus-5-5 exceeded 20 s at full density and haiku-5-5 returned invalid JSON. */
  CITY_MODEL: z.string().trim().min(1).default('claude-sonnet-5-5'),
  /** Whole-line English for shift-click glosses when no authored translation exists. */
  DICTIONARY_MODEL: z.string().trim().min(1).default('claude-sonnet-5-5'),
});

/** Server-only configuration. Never serialize this object to a client. */
export interface ServerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  anthropicApiKey: string | undefined;
  anthropicModel: string;
  geminiApiKey: string | undefined;
  geminiModel: string;
  geminiLiveModel: string;
  elevenlabsApiKey: string | undefined;
  elevenlabsTtsModel: string;
  elevenlabsPaModel: string;
  elevenlabsSttModel: string;
  voiceIds: Record<NpcId, string>;
  enableClaudeCity: boolean;
  cityModel: string;
  dictionaryModel: string;
  enableDemoFixtures: boolean;
  e2eFastMovement?: boolean;
  enableValidationHarness: boolean;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  // Blank values in a local .env are equivalent to unset optional settings.
  const normalized = Object.fromEntries(
    Object.entries(environment).map(([name, value]) => [name, value?.trim() || undefined]),
  );
  const parsed = environmentSchema.safeParse(normalized);
  if (!parsed.success) {
    // Do not include raw environment values (which may be credentials).
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid server configuration: ${names.join(', ')}`);
  }
  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    host: env.HOST, // Hosted deployments set HOST=0.0.0.0; local default stays loopback.
    port: env.PORT ?? (env.NODE_ENV === 'production' ? 4173 : 3001),
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
    geminiLiveModel: env.GEMINI_LIVE_MODEL,
    elevenlabsApiKey: env.ELEVENLABS_API_KEY,
    elevenlabsTtsModel: env.ELEVENLABS_TTS_MODEL,
    elevenlabsPaModel: env.ELEVENLABS_PA_MODEL,
    elevenlabsSttModel: env.ELEVENLABS_STT_MODEL,
    voiceIds: Object.fromEntries(characterDescriptions.map((npc) => [npc.id, npc.voice.id])) as Record<NpcId, string>,
    enableClaudeCity: env.ENABLE_CLAUDE_CITY,
    cityModel: env.CITY_MODEL,
    dictionaryModel: env.DICTIONARY_MODEL,
    enableDemoFixtures: env.ENABLE_DEMO_FIXTURES,
    e2eFastMovement: env.ENABLE_DEMO_FIXTURES && env.E2E_FAST_MOVEMENT,
    enableValidationHarness: env.ENABLE_VALIDATION_HARNESS,
  };
}

export function validationHarnessEnabled(config: ServerConfig): boolean {
  return config.nodeEnv !== 'production' && config.enableValidationHarness;
}
