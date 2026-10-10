import express, { Router } from 'express';
import { z } from 'zod';
import { HttpError, SegmentNotImplementedError } from '../errors.js';
import type { ServerServices } from '../services.js';

export const MAX_TRANSCRIPTION_REQUEST_BYTES = 3 * 1024 * 1024;
const idSchema = z.string().min(1).max(128);
const sessionParamsSchema = z.object({ id: idSchema });
const speechParamsSchema = sessionParamsSchema.extend({ speechId: idSchema });

export function createAudioRouter(services: ServerServices): Router {
  // The injected provider is the only audio dependency Segment-005 may call.
  void services;
  const router = Router();

  router.get('/sessions/:id/speech/:speechId', (request, _response, next) => {
    if (!speechParamsSchema.safeParse(request.params).success) {
      return next(new HttpError(400, 'INVALID_REQUEST', 'Invalid speech identifier.'));
    }
    return next(new SegmentNotImplementedError('Segment-005', 'Speech retrieval'));
  });

  router.post(
    '/sessions/:id/transcriptions',
    express.raw({ type: 'multipart/form-data', limit: MAX_TRANSCRIPTION_REQUEST_BYTES }),
    (request, _response, next) => {
      if (!sessionParamsSchema.safeParse(request.params).success) {
        return next(new HttpError(400, 'INVALID_REQUEST', 'Invalid session identifier.'));
      }
      const contentType = request.get('content-type') ?? '';
      if (!/^multipart\/form-data\s*;.*\bboundary=(?:"[^"]+"|[^;\s]+)/i.test(contentType)) {
        return next(new HttpError(400, 'INVALID_REQUEST', 'A multipart audio clip is required.'));
      }
      // Segment-005 owns multipart parsing, session binding, and STT validation.
      return next(new SegmentNotImplementedError('Segment-005', 'Mandarin transcription'));
    },
  );

  return router;
}
