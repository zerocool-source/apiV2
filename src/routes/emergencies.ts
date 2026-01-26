import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createEmergencySchema = z.object({
  propertyId: z.string().uuid(),
  assignmentId: z.string().uuid().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.string().min(1),
  description: z.string().min(1),
  actionsTaken: z.string().optional(),
  photos: z.array(z.string()).optional(),
});

const emergenciesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/emergencies
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { propertyId?: string; severity?: string };
    
    const where: any = {};
    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }
    if (query.severity) {
      where.severity = query.severity;
    }

    const emergencies = await fastify.prisma.emergencyReport.findMany({
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

    return emergencies;
  });

  // POST /api/emergencies
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = createEmergencySchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { propertyId, assignmentId, severity, category, description, actionsTaken, photos } = result.data;
    const userId = request.user.sub;

    // Verify property exists
    const property = await fastify.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      return notFound(reply, 'Property not found');
    }

    const emergency = await fastify.prisma.emergencyReport.create({
      data: {
        propertyId,
        assignmentId,
        createdBy: userId,
        severity,
        category,
        description,
        actionsTaken,
        photos: photos || [],
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

    return reply.status(201).send(emergency);
  });
};

export default emergenciesRoutes;
