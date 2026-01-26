import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createRosterSchema = z.object({
  date: z.string().datetime(),
  userId: z.string().uuid(),
  shift: z.string().optional(),
});

const rosterRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/roster
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { date?: string; userId?: string };
    
    const where: any = {};
    if (query.date) {
      const date = new Date(query.date);
      where.date = {
        gte: new Date(date.setHours(0, 0, 0, 0)),
        lt: new Date(date.setHours(23, 59, 59, 999)),
      };
    }
    if (query.userId) {
      where.userId = query.userId;
    }

    const roster = await fastify.prisma.roster.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    return roster;
  });

  // POST /api/roster
  fastify.post('/', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async (request, reply) => {
    const result = createRosterSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { date, userId, shift } = result.data;

    const rosterEntry = await fastify.prisma.roster.create({
      data: {
        date: new Date(date),
        userId,
        shift,
      },
    });

    return reply.status(201).send(rosterEntry);
  });

  // DELETE /api/roster/:id
  fastify.delete('/:id', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const rosterEntry = await fastify.prisma.roster.findUnique({
      where: { id },
    });

    if (!rosterEntry) {
      return notFound(reply, 'Roster entry not found');
    }

    await fastify.prisma.roster.delete({
      where: { id },
    });

    return { message: 'Roster entry deleted' };
  });
};

export default rosterRoutes;
