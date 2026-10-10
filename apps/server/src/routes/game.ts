import { ActionRequestSchema, CreateSessionRequestSchema, TurnRequestSchema } from '@vibequest/shared';
import { Router } from 'express';
import { z } from 'zod';
import { validationHarnessEnabled } from '../config.js';
import { HttpError, SegmentNotImplementedError } from '../errors.js';
import type { ServerServices } from '../services.js';

const sessionParamsSchema = z.object({ id: z.string().min(1).max(128) });

export function createGameRouter(services: ServerServices): Router {
  const router = Router();
  const notImplemented = () => new SegmentNotImplementedError('Segment-001', 'Game session API');

  router.post('/sessions', (request, _response, next) => {
    const parsed = CreateSessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return next(new HttpError(400, 'INVALID_REQUEST', 'Invalid create-session request.'));
    }
    if (parsed.data.validationMode && !validationHarnessEnabled(services.config)) {
      return next(new HttpError(422, 'VALIDATION_DISABLED', 'The validation harness is unavailable.'));
    }
    if (parsed.data.providerMode === 'fixture' && !services.config.enableDemoFixtures) {
      return next(new HttpError(422, 'FIXTURES_DISABLED', 'Fixture sessions are disabled.'));
    }
    return next(notImplemented());
  });

  router.get('/sessions/:id', (request, _response, next) => {
    if (!sessionParamsSchema.safeParse(request.params).success) {
      return next(new HttpError(400, 'INVALID_REQUEST', 'Invalid session identifier.'));
    }
    return next(notImplemented());
  });

  router.post('/sessions/:id/actions', (request, _response, next) => {
    if (
      !sessionParamsSchema.safeParse(request.params).success ||
      !ActionRequestSchema.safeParse(request.body).success
    ) {
      return next(new HttpError(400, 'INVALID_REQUEST', 'Invalid action request.'));
    }
    return next(notImplemented());
  });

  router.post('/sessions/:id/turns', (request, _response, next) => {
    if (
      !sessionParamsSchema.safeParse(request.params).success ||
      !TurnRequestSchema.safeParse(request.body).success
    ) {
      return next(new HttpError(400, 'INVALID_REQUEST', 'Invalid dialogue turn request.'));
    }
    return next(notImplemented());
  });

  return router;
}
