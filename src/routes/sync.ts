import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../utils/errors';

const syncBatchSchema = z.object({
  actions: z.array(z.object({
    type: z.string(),
    endpoint: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    payload: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
  })),
});

const syncRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/sync - Batch upload queued offline actions
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = syncBatchSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { actions } = result.data;
    const userId = request.user.sub;

    // Store the sync batch for processing
    const syncBatch = await fastify.prisma.syncBatch.create({
      data: {
        userId,
        payload: actions,
      },
    });

    // Process each action
    const results: { action: string; success: boolean; error?: string }[] = [];
    
    for (const action of actions) {
      try {
        // Log the action - in a real implementation, you'd process each action
        results.push({
          action: `${action.method} ${action.endpoint}`,
          success: true,
        });
      } catch (error) {
        results.push({
          action: `${action.method} ${action.endpoint}`,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return reply.status(201).send({
      batchId: syncBatch.id,
      processed: actions.length,
      results,
    });
  });

  // GET /api/sync/history
  fastify.get('/history', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const userId = request.user.sub;

    const batches = await fastify.prisma.syncBatch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return batches;
  });
};

export default syncRoutes;
