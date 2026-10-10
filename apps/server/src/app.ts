import express, { type ErrorRequestHandler, type Express } from 'express';
import { fileURLToPath } from 'node:url';
import { loadConfig, validationHarnessEnabled, type ServerConfig } from './config.js';
import { HttpError } from './errors.js';
import { createAudioRouter } from './routes/audio.js';
import { createGameRouter } from './routes/game.js';
import { createServices, type ServerServices } from './services.js';

export interface AppOptions {
  config?: ServerConfig;
  services?: ServerServices;
  /** Injectable for static/SPA tests; defaults to the built web workspace. */
  publicDirectory?: string;
}

export function createApp(options: AppOptions = {}): Express {
  const config = options.config ?? options.services?.config ?? loadConfig();
  const services = options.services ? { ...options.services, config } : createServices(config);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      buildId: 'segment-000',
      specVersion: '1.2',
      providers: {
        geminiConfigured: Boolean(config.geminiApiKey),
        elevenlabsConfigured: Boolean(config.elevenlabsApiKey),
      },
      features: {
        validationHarness: validationHarnessEnabled(config),
        fixtures: config.enableDemoFixtures,
      },
      segments: {
        engine: 'unimplemented',
        dialogue: 'unimplemented',
        speech: 'unimplemented',
      },
    });
  });
  app.use('/api', createGameRouter(services));
  app.use('/api', createAudioRouter(services));
  app.use('/api', (_request, _response, next) => {
    next(new HttpError(404, 'NOT_FOUND', 'Unknown API route.'));
  });

  // Production rejects the harness before static assets or SPA fallback resolve.
  app.use(['/__validation', '/validation'], (_request, _response, next) => {
    if (!validationHarnessEnabled(config)) {
      return next(new HttpError(422, 'VALIDATION_DISABLED', 'The validation harness is unavailable.'));
    }
    return next();
  });

  if (config.nodeEnv === 'production') {
    const publicDirectory = options.publicDirectory ?? fileURLToPath(new URL('../../web/dist', import.meta.url));
    app.use(express.static(publicDirectory, { index: false }));
    app.get('/{*splat}', (_request, response, next) => {
      // A root-relative file keeps hidden checkout ancestors (for example
      // ~/.codex/worktrees) out of sendFile's dotfile URL protection.
      response.sendFile('index.html', { root: publicDirectory }, (error) => {
        if (error) next(error);
      });
    });
  }

  app.use((_request, _response, next) => {
    next(new HttpError(404, 'NOT_FOUND', 'Unknown route.'));
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.headersSent) return next(error);
    if (error instanceof HttpError) {
      return response.status(error.status).json({
        error: { code: error.code, message: error.message, retryable: error.retryable },
      });
    }
    if (error && typeof error === 'object' && 'type' in error) {
      if (error.type === 'entity.too.large') {
        return response.status(413).json({
          error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request exceeds the upload limit.', retryable: false },
        });
      }
      if (error.type === 'entity.parse.failed') {
        return response.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Invalid JSON body.', retryable: false },
        });
      }
    }
    return response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The server could not process this request.', retryable: false },
    });
  };
  app.use(errorHandler);
  return app;
}
