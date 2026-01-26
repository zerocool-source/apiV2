import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../utils/errors';

const createLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

const updateStatusSchema = z.object({
  clockedIn: z.boolean().optional(),
  currentPropertyId: z.string().uuid().nullable().optional(),
  currentAssignmentId: z.string().uuid().nullable().optional(),
});

const locationsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/locations - Tech posts GPS updates
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = createLocationSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { latitude, longitude } = result.data;
    const userId = request.user.sub;

    const locationPing = await fastify.prisma.locationPing.create({
      data: {
        userId,
        latitude,
        longitude,
      },
    });

    return reply.status(201).send(locationPing);
  });

  // PATCH /api/locations/status - Update technician status
  fastify.patch('/status', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = updateStatusSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const userId = request.user.sub;

    const status = await fastify.prisma.technicianStatus.upsert({
      where: { userId },
      create: {
        userId,
        ...result.data,
      },
      update: result.data,
    });

    return status;
  });

  // GET /api/locations/history
  fastify.get('/history', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { userId?: string; limit?: string };
    const user = request.user;
    
    // Techs can only see their own history
    const userId = user.role === 'tech' ? user.sub : query.userId;

    const pings = await fastify.prisma.locationPing.findMany({
      where: userId ? { userId } : {},
      orderBy: { timestamp: 'desc' },
      take: parseInt(query.limit || '100'),
    });

    return pings;
  });
};

export default locationsRoutes;
