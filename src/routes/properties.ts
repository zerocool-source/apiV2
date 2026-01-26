import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createPropertySchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  notes: z.string().optional(),
});

const completePropertySchema = z.object({
  assignmentId: z.string().uuid(),
  completedAt: z.string().datetime().optional(),
  checklistResponses: z.array(z.object({
    question: z.string(),
    answer: z.union([z.string(), z.boolean(), z.number()]),
  })).optional(),
  chemicalReadings: z.object({
    ph: z.number(),
    chlorine: z.number(),
    alkalinity: z.number(),
    cya: z.number().optional(),
    orp: z.number().optional(),
  }).optional(),
  notes: z.string().optional(),
  photos: z.array(z.string()).optional(),
});

const propertiesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/properties
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const user = request.user;

    // Tech can only see properties that appear in their assignments
    if (user.role === 'tech') {
      const assignments = await fastify.prisma.assignment.findMany({
        where: { technicianId: user.sub },
        select: { propertyId: true },
      });

      const propertyIds = [...new Set(assignments.map(a => a.propertyId))];

      if (propertyIds.length === 0) {
        return [];
      }

      const properties = await fastify.prisma.property.findMany({
        where: { id: { in: propertyIds } },
        orderBy: { name: 'asc' },
      });

      return properties;
    }

    // Supervisor/admin can see all properties
    const properties = await fastify.prisma.property.findMany({
      orderBy: { name: 'asc' },
    });
    return properties;
  });

  // GET /api/properties/:id
  fastify.get('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;
    
    const property = await fastify.prisma.property.findUnique({
      where: { id },
      include: {
        assignments: true,
      },
    });

    if (!property) {
      return notFound(reply, 'Property not found');
    }

    // Tech can only see properties they are assigned to
    if (user.role === 'tech') {
      const hasAssignment = property.assignments.some(a => a.technicianId === user.sub);
      if (!hasAssignment) {
        return notFound(reply, 'Property not found');
      }
    }

    return property;
  });

  // POST /api/properties
  fastify.post('/', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async (request, reply) => {
    const result = createPropertySchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const property = await fastify.prisma.property.create({
      data: result.data,
    });

    return reply.status(201).send(property);
  });

  // POST /api/properties/:id/complete
  fastify.post('/:id/complete', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = completePropertySchema.safeParse(request.body);
    
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const property = await fastify.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      return notFound(reply, 'Property not found');
    }

    const { assignmentId, completedAt, checklistResponses, chemicalReadings, notes } = result.data;

    // Update assignment
    const assignment = await fastify.prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        status: 'completed',
        completedAt: completedAt ? new Date(completedAt) : new Date(),
        notes,
      },
    });

    // Create checklist response if provided
    if (checklistResponses && checklistResponses.length > 0) {
      await fastify.prisma.checklistResponse.create({
        data: {
          assignmentId,
          propertyId: id,
          responses: checklistResponses,
        },
      });
    }

    // Create chemical reading if provided
    if (chemicalReadings) {
      await fastify.prisma.chemicalReading.create({
        data: {
          assignmentId,
          propertyId: id,
          ...chemicalReadings,
        },
      });
    }

    return {
      message: 'Property service completed',
      assignment,
    };
  });
};

export default propertiesRoutes;
