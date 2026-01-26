import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createRouteStopSchema = z.object({
  assignmentId: z.string().uuid(),
  order: z.number().int().min(0),
  eta: z.string().datetime().optional(),
});

const routeStopsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/route-stops
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { assignmentId?: string };
    
    const where: any = {};
    if (query.assignmentId) {
      where.assignmentId = query.assignmentId;
    }

    const routeStops = await fastify.prisma.routeStop.findMany({
      where,
      include: {
        assignment: {
          include: {
            property: true,
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    return routeStops;
  });

  // POST /api/route-stops
  fastify.post('/', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async (request, reply) => {
    const result = createRouteStopSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { assignmentId, order, eta } = result.data;

    // Verify assignment exists
    const assignment = await fastify.prisma.assignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) {
      return notFound(reply, 'Assignment not found');
    }

    const routeStop = await fastify.prisma.routeStop.create({
      data: {
        assignmentId,
        order,
        eta: eta ? new Date(eta) : undefined,
      },
      include: {
        assignment: {
          include: {
            property: true,
          },
        },
      },
    });

    return reply.status(201).send(routeStop);
  });
};

export default routeStopsRoutes;
