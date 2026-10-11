import { ChunkRequestSchema, ChunkRestoreRequestSchema, questWeights, type QuestContextSnapshot } from '@vibequest/shared';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../errors.js';
import type { ServerServices } from '../services.js';

const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export function createCityRouter(services: ServerServices): Router {
  const router = Router();
  /** Only the world ID, quest, and sanitized weights leave the session: no conversation text reaches generation. */
  const sessionContext = (id: string) => services.sessionStore.withSession(id, async ({ state }) => ({
    worldId: state.worldId,
    fixture: state.providerStatus === 'fixture',
    questContext: { missionId: state.missionId, weights: questWeights(state.missionId, state.exploration) } satisfies QuestContextSnapshot,
  }));
  const fail = (response: import('express').Response, error: unknown) => {
    const known = error instanceof HttpError ? error : new HttpError(500, 'INTERNAL_ERROR', 'The server could not process this request.');
    response.status(known.status).json({ error: { code: known.code, message: known.message, retryable: known.retryable } });
  };

  router.get('/worlds/:worldId', (request, response) => {
    const worldId = idSchema.safeParse(request.params.worldId);
    if (!worldId.success) return fail(response, new HttpError(400, 'INVALID_REQUEST', 'Invalid world identifier.'));
    try { response.json(services.worlds.open(worldId.data)); } catch (error) { fail(response, error); }
  });
  router.post('/sessions/:id/chunks', async (request, response) => {
    const id = idSchema.safeParse(request.params.id);
    const body = ChunkRequestSchema.safeParse(request.body);
    if (!id.success || !body.success) return fail(response, new HttpError(400, 'INVALID_REQUEST', 'Invalid chunk request.'));
    try {
      const context = await sessionContext(id.data);
      response.json(await services.worlds.request(id.data, context.worldId, body.data.coords, body.data.urgent, context.questContext, !context.fixture));
    } catch (error) { fail(response, error); }
  });
  router.post('/sessions/:id/chunks/restore', async (request, response) => {
    const id = idSchema.safeParse(request.params.id);
    const body = ChunkRestoreRequestSchema.safeParse(request.body);
    if (!id.success || !body.success) return fail(response, new HttpError(400, 'INVALID_REQUEST', 'Invalid restore request.'));
    try {
      const { worldId } = await sessionContext(id.data);
      response.json(services.worlds.restore(worldId, body.data.chunks));
    } catch (error) { fail(response, error); }
  });
  return router;
}
