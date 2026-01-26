import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createServiceRepairSchema = z.object({
  propertyId: z.string().uuid(),
  details: z.record(z.unknown()),
});

const serviceRepairsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/service-repairs
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { propertyId?: string };
    
    const where: any = {};
    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }

    const serviceRepairs = await fastify.prisma.serviceRepair.findMany({
      where,
      include: {
        property: true,
        creator: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return serviceRepairs;
  });

  // POST /api/service-repairs
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = createServiceRepairSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { propertyId, details } = result.data;
    const createdBy = request.user.sub;

    // Verify property exists
    const property = await fastify.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      return notFound(reply, 'Property not found');
    }

    const serviceRepair = await fastify.prisma.serviceRepair.create({
      data: {
        propertyId,
        createdBy,
        details,
      },
      include: {
        property: true,
        creator: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
    });

    return reply.status(201).send(serviceRepair);
  });
};

export default serviceRepairsRoutes;
