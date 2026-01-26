import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createAssignmentSchema = z.object({
  propertyId: z.string().uuid(),
  technicianId: z.string().uuid(),
  scheduledDate: z.string().datetime(),
  notes: z.string().optional(),
});

const updateAssignmentSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  scheduledDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  completedAt: z.string().datetime().optional(),
});

const assignmentsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/assignments
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const user = request.user;
    const query = request.query as { technicianId?: string; propertyId?: string; status?: string };

    const where: any = {};
    
    // Techs can only see their own assignments
    if (user.role === 'tech') {
      where.technicianId = user.sub;
    } else if (query.technicianId) {
      where.technicianId = query.technicianId;
    }

    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const assignments = await fastify.prisma.assignment.findMany({
      where,
      include: {
        property: true,
        technician: {
          select: {
            id: true,
            email: true,
            role: true,
            technicianProfile: true,
          },
        },
      },
      orderBy: { scheduledDate: 'asc' },
    });

    return assignments;
  });

  // GET /api/assignments/created
  fastify.get('/created', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async () => {
    const assignments = await fastify.prisma.assignment.findMany({
      include: {
        property: true,
        technician: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return assignments;
  });

  // GET /api/assignments/:id
  fastify.get('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const assignment = await fastify.prisma.assignment.findUnique({
      where: { id },
      include: {
        property: true,
        technician: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
        routeStops: true,
        checklistResponses: true,
        chemicalReadings: true,
      },
    });

    if (!assignment) {
      return notFound(reply, 'Assignment not found');
    }

    return assignment;
  });

  // POST /api/assignments
  fastify.post('/', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async (request, reply) => {
    const result = createAssignmentSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { propertyId, technicianId, scheduledDate, notes } = result.data;

    // Verify property exists
    const property = await fastify.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      return notFound(reply, 'Property not found');
    }

    // Verify technician exists
    const technician = await fastify.prisma.user.findUnique({
      where: { id: technicianId },
    });
    if (!technician) {
      return notFound(reply, 'Technician not found');
    }

    const assignment = await fastify.prisma.assignment.create({
      data: {
        propertyId,
        technicianId,
        scheduledDate: new Date(scheduledDate),
        notes,
      },
      include: {
        property: true,
        technician: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
    });

    return reply.status(201).send(assignment);
  });

  // PATCH /api/assignments/:id
  fastify.patch('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = updateAssignmentSchema.safeParse(request.body);
    
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const existing = await fastify.prisma.assignment.findUnique({
      where: { id },
    });

    if (!existing) {
      return notFound(reply, 'Assignment not found');
    }

    const updateData: any = {};
    if (result.data.status) updateData.status = result.data.status;
    if (result.data.scheduledDate) updateData.scheduledDate = new Date(result.data.scheduledDate);
    if (result.data.notes !== undefined) updateData.notes = result.data.notes;
    if (result.data.completedAt) updateData.completedAt = new Date(result.data.completedAt);

    const assignment = await fastify.prisma.assignment.update({
      where: { id },
      data: updateData,
      include: {
        property: true,
        technician: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
    });

    return assignment;
  });
};

export default assignmentsRoutes;
