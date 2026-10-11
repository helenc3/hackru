import { z } from 'zod';

const booleanEnvironmentSchema = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  GEMINI_API_KEY: z.string().trim().min(1).optional(),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-3.8-flash'),
  GEMINI_LIVE_MODEL: z.string().trim().min(1).default('gemini-3.8-live'),
  ELEVENLABS_API_KEY: z.string().trim().min(1).optional(),
  ELEVENLABS_TTS_MODEL: z.string().trim().min(1).default('eleven_v4_turbo'),
  ELEVENLABS_PA_MODEL: z.string().trim().min(1).default('eleven_v4'),
  ELEVENLABS_STT_MODEL: z.string().trim().min(1).default('scribe_v2'),
  ELEVENLABS_VOICE_XIAOLIN: z.string().trim().min(1).optional(),
  ELEVENLABS_VOICE_ACHEN: z.string().trim().min(1).optional(),
  ELEVENLABS_VOICE_LAOZHOU: z.string().trim().min(1).optional(),
  ENABLE_DEMO_FIXTURES: booleanEnvironmentSchema,
  ENABLE_VALIDATION_HARNESS: booleanEnvironmentSchema,
});

/** Server-only configuration. Never serialize this object to a client. */
export interface ServerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  geminiApiKey: string | undefined;
  geminiModel: string;
  geminiLiveModel: string;
  elevenlabsApiKey: string | undefined;
  elevenlabsTtsModel: string;
  elevenlabsPaModel: string;
  elevenlabsSttModel: string;
  voiceIds: {
    xiaolin: string | undefined;
    achen: string | undefined;
    laozhou: string | undefined;
  };
  enableDemoFixtures: boolean;
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
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
    geminiLiveModel: env.GEMINI_LIVE_MODEL,
    elevenlabsApiKey: env.ELEVENLABS_API_KEY,
    elevenlabsTtsModel: env.ELEVENLABS_TTS_MODEL,
    elevenlabsPaModel: env.ELEVENLABS_PA_MODEL,
    elevenlabsSttModel: env.ELEVENLABS_STT_MODEL,
    voiceIds: {
      xiaolin: env.ELEVENLABS_VOICE_XIAOLIN,
      achen: env.ELEVENLABS_VOICE_ACHEN,
      laozhou: env.ELEVENLABS_VOICE_LAOZHOU,
    },
    enableDemoFixtures: env.ENABLE_DEMO_FIXTURES,
    enableValidationHarness: env.ENABLE_VALIDATION_HARNESS,
  };
}

export function validationHarnessEnabled(config: ServerConfig): boolean {
  return config.nodeEnv !== 'production' && config.enableValidationHarness;
}
