import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createInspectionSchema = z.object({
  propertyId: z.string().uuid(),
  type: z.string().min(1),
  results: z.record(z.unknown()),
});

const inspectionsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/inspections
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { propertyId?: string; type?: string };
    
    const where: any = {};
    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }
    if (query.type) {
      where.type = query.type;
    }

    const inspections = await fastify.prisma.inspection.findMany({
      where,
      include: {
        property: true,
        inspector: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return inspections;
  });

  // POST /api/inspections
  fastify.post('/', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async (request, reply) => {
    const result = createInspectionSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { propertyId, type, results } = result.data;
    const inspectorUserId = request.user.sub;

    // Verify property exists
    const property = await fastify.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      return notFound(reply, 'Property not found');
    }

    const inspection = await fastify.prisma.inspection.create({
      data: {
        propertyId,
        inspectorUserId,
        type,
        results,
      },
      include: {
        property: true,
        inspector: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
    });

    return reply.status(201).send(inspection);
  });
};

export default inspectionsRoutes;
