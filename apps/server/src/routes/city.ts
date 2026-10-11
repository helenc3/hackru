import { ChunkRequestSchema, ChunkRestoreRequestSchema, identifier, questWeights, type QuestContextSnapshot } from '@vibequest/shared';
import { Router } from 'express';
import { HttpError } from '../errors.js';
import type { ServerServices } from '../services.js';

export function createCityRouter(services: ServerServices): Router {
  const router = Router();
  /** Only the world ID, quest, and sanitized weights leave the session: no conversation text reaches generation. */
  const sessionContext = (id: string) => services.sessionStore.withSession(id, async ({ state }) => ({
    worldId: state.worldId,
    fixture: state.providerStatus === 'fixture',
    questContext: { missionId: state.missionId, weights: questWeights(state.missionId, state.exploration) } satisfies QuestContextSnapshot,
  }));

  router.get('/worlds/:worldId', (request, response, next) => {
    const worldId = identifier.safeParse(request.params.worldId);
    if (!worldId.success) return next(new HttpError(400, 'INVALID_REQUEST', 'Invalid world identifier.'));
    try { response.json(services.worlds.open(worldId.data)); } catch (error) { next(error); }
  });
  router.post('/sessions/:id/chunks', async (request, response, next) => {
    const id = identifier.safeParse(request.params.id);
    const body = ChunkRequestSchema.safeParse(request.body);
    if (!id.success || !body.success) return next(new HttpError(400, 'INVALID_REQUEST', 'Invalid chunk request.'));
    try {
      const context = await sessionContext(id.data);
      response.json(await services.worlds.request(id.data, context.worldId, body.data.coords, body.data.urgent, context.questContext, !context.fixture));
    } catch (error) { next(error); }
  });
  router.post('/sessions/:id/chunks/restore', async (request, response, next) => {
    const id = identifier.safeParse(request.params.id);
    const body = ChunkRestoreRequestSchema.safeParse(request.body);
    if (!id.success || !body.success) return next(new HttpError(400, 'INVALID_REQUEST', 'Invalid restore request.'));
    try {
      const { worldId } = await sessionContext(id.data);
      response.json(services.worlds.restore(worldId, body.data.chunks));
    } catch (error) { next(error); }
  });
  return router;
}
