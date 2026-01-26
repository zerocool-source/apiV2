import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound, forbidden } from '../utils/errors';

const createAssignmentSchema = z.object({
  propertyId: z.string().uuid(),
  technicianId: z.string().uuid(),
  scheduledDate: z.string().datetime(),
  priority: z.enum(['low', 'med', 'high']).optional(),
  notes: z.string().optional(),
});

const supervisorUpdateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'med', 'high']).optional(),
  scheduledDate: z.string().datetime().optional(),
  technicianId: z.string().uuid().optional(),
  notes: z.string().optional(),
  completedAt: z.string().datetime().optional(),
});

const techUpdateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  notes: z.string().optional(),
});

const assignmentsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/assignments
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const user = request.user;
    const query = request.query as { technicianId?: string; propertyId?: string; status?: string; priority?: string };

    const where: any = {};
    
    if (user.role === 'tech') {
      // Techs can only see their own assignments
      where.technicianId = user.sub;
    } else if (user.role === 'supervisor') {
      // Supervisors can only see assignments for their team
      where.technician = {
        technicianProfile: {
          supervisorId: user.sub,
        },
      };
      if (query.technicianId) {
        where.technicianId = query.technicianId;
      }
    } else if (query.technicianId) {
      // Admin can filter by technicianId
      where.technicianId = query.technicianId;
    }

    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.priority) {
      where.priority = query.priority;
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
  }, async (request) => {
    const user = request.user;
    const where: any = {};

    if (user.role === 'supervisor') {
      where.technician = {
        technicianProfile: {
          supervisorId: user.sub,
        },
      };
    }

    const assignments = await fastify.prisma.assignment.findMany({
      where,
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
    const user = request.user;

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

    // Techs can only view their own assignments
    if (user.role === 'tech' && assignment.technicianId !== user.sub) {
      return forbidden(reply, 'You can only view your own assignments');
    }

    // Supervisors can only view their team's assignments
    if (user.role === 'supervisor') {
      const techProfile = assignment.technician.technicianProfile;
      if (!techProfile || techProfile.supervisorId !== user.sub) {
        return forbidden(reply, 'You can only view your team\'s assignments');
      }
    }

    return assignment;
  });

  // POST /api/assignments (supervisor/admin only)
  fastify.post('/', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async (request, reply) => {
    const user = request.user;
    const result = createAssignmentSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { propertyId, technicianId, scheduledDate, priority, notes } = result.data;

    // Verify property exists
    const property = await fastify.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      return notFound(reply, 'Property not found');
    }

    // Verify technician exists and belongs to supervisor's team
    const technician = await fastify.prisma.user.findUnique({
      where: { id: technicianId },
      include: { technicianProfile: true },
    });
    if (!technician) {
      return notFound(reply, 'Technician not found');
    }

    // Supervisor can only assign their own team members
    if (user.role === 'supervisor') {
      if (!technician.technicianProfile || technician.technicianProfile.supervisorId !== user.sub) {
        return forbidden(reply, 'You can only create assignments for your team members');
      }
    }

    const assignment = await fastify.prisma.assignment.create({
      data: {
        propertyId,
        technicianId,
        scheduledDate: new Date(scheduledDate),
        priority: priority || 'med',
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
    const user = request.user;

    const existing = await fastify.prisma.assignment.findUnique({
      where: { id },
      include: {
        technician: {
          include: { technicianProfile: true },
        },
      },
    });

    if (!existing) {
      return notFound(reply, 'Assignment not found');
    }

    // Determine allowed fields based on role
    const isSupervisorOrAdmin = user.role === 'supervisor' || user.role === 'admin';
    const isTech = user.role === 'tech';

    // Tech can only update their own assignments
    if (isTech && existing.technicianId !== user.sub) {
      return forbidden(reply, 'You can only update your own assignments');
    }

    // Supervisor can only update their team's assignments
    if (user.role === 'supervisor') {
      const techProfile = existing.technician.technicianProfile;
      if (!techProfile || techProfile.supervisorId !== user.sub) {
        return forbidden(reply, 'You can only update your team\'s assignments');
      }
    }

    // Validate request body based on role
    if (isSupervisorOrAdmin) {
      const result = supervisorUpdateSchema.safeParse(request.body);
      if (!result.success) {
        return badRequest(reply, 'Invalid request body', result.error.flatten());
      }

      // If changing technician, verify they belong to supervisor's team
      if (result.data.technicianId && user.role === 'supervisor') {
        const newTech = await fastify.prisma.user.findUnique({
          where: { id: result.data.technicianId },
          include: { technicianProfile: true },
        });
        if (!newTech?.technicianProfile || newTech.technicianProfile.supervisorId !== user.sub) {
          return forbidden(reply, 'You can only assign to your team members');
        }
      }

      const updateData: any = {};
      if (result.data.status) updateData.status = result.data.status;
      if (result.data.priority) updateData.priority = result.data.priority;
      if (result.data.scheduledDate) updateData.scheduledDate = new Date(result.data.scheduledDate);
      if (result.data.technicianId) updateData.technicianId = result.data.technicianId;
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
    } else if (isTech) {
      // Tech can only update status and notes
      const result = techUpdateSchema.safeParse(request.body);
      if (!result.success) {
        return badRequest(reply, 'Invalid request body', result.error.flatten());
      }

      // Check if tech is trying to update forbidden fields
      const body = request.body as any;
      const forbiddenFields = ['priority', 'scheduledDate', 'technicianId', 'completedAt', 'propertyId'];
      for (const field of forbiddenFields) {
        if (body[field] !== undefined) {
          return forbidden(reply, `Technicians cannot update the '${field}' field`);
        }
      }

      const updateData: any = {};
      if (result.data.status) updateData.status = result.data.status;
      if (result.data.notes !== undefined) updateData.notes = result.data.notes;

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
    } else {
      return forbidden(reply, 'Insufficient permissions');
    }
  });
};

export default assignmentsRoutes;
