import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound, forbidden } from '../utils/errors';

function normalizeStatus(status: string): string {
  if (status === 'canceled') return 'cancelled';
  return status;
}

function normalizeRequestBody(body: any): any {
  if (body && typeof body.status === 'string') {
    return { ...body, status: normalizeStatus(body.status) };
  }
  return body;
}

const createAssignmentSchema = z.object({
  propertyId: z.string().uuid(),
  technicianId: z.string().uuid(),
  scheduledDate: z.string().datetime(),
  priority: z.enum(['low', 'med', 'high']).optional(),
  notes: z.string().optional(),
});

const supervisorUpdateSchema = z.object({
  status: z.enum(['cancelled']).optional(),
  priority: z.enum(['low', 'med', 'high']).optional(),
  scheduledDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  canceledReason: z.string().optional(),
});

const adminUpdateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'med', 'high']).optional(),
  scheduledDate: z.string().datetime().optional(),
  technicianId: z.string().uuid().optional(),
  notes: z.string().optional(),
  canceledReason: z.string().optional(),
});

const techUpdateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed']).optional(),
  notes: z.string().optional(),
});

const assignmentsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/assignments
  fastify.get('/', {
    schema: {
      tags: ['Assignments'],
      summary: 'List assignments',
      description: 'Get assignments. Tech sees own, supervisor sees team, admin sees all. Excludes cancelled by default.',
      querystring: {
        type: 'object',
        properties: {
          technicianId: { type: 'string', format: 'uuid' },
          propertyId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled', 'canceled'] },
          priority: { type: 'string', enum: ['low', 'med', 'high'] },
          includeCanceled: { type: 'string', enum: ['true', 'false'], description: 'Include cancelled assignments' },
        },
      },
      response: {
        200: {
          type: 'array',
          items: { $ref: '#/components/schemas/Assignment' },
        },
        401: { $ref: '#/components/schemas/Error' },
      },
    },
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const user = request.user;
    const query = request.query as { 
      technicianId?: string; 
      propertyId?: string; 
      status?: string; 
      priority?: string;
      includeCanceled?: string;
    };

    const where: any = {};
    
    // By default, exclude canceled assignments unless ?includeCanceled=true
    const includeCanceled = query.includeCanceled === 'true';
    if (!includeCanceled) {
      where.status = { not: 'cancelled' };
    }
    
    if (user.role === 'tech') {
      where.technicianId = user.sub;
    } else if (user.role === 'supervisor') {
      where.technician = {
        technicianProfile: {
          supervisorId: user.sub,
        },
      };
      if (query.technicianId) {
        where.technicianId = query.technicianId;
      }
    } else if (query.technicianId) {
      where.technicianId = query.technicianId;
    }

    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }

    // Allow explicit status filter (overrides includeCanceled logic)
    // Normalize "canceled" -> "cancelled" for query param
    if (query.status) {
      where.status = normalizeStatus(query.status);
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
    const query = request.query as { includeCanceled?: string };
    const where: any = {};

    const includeCanceled = query.includeCanceled === 'true';
    if (!includeCanceled) {
      where.status = { not: 'cancelled' };
    }

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

    if (user.role === 'tech' && assignment.technicianId !== user.sub) {
      return forbidden(reply, 'You can only view your own assignments');
    }

    if (user.role === 'supervisor') {
      const techProfile = assignment.technician.technicianProfile;
      if (!techProfile || techProfile.supervisorId !== user.sub) {
        return forbidden(reply, 'You can only view your team\'s assignments');
      }
    }

    return assignment;
  });

  // POST /api/assignments (supervisor/repair/admin only - tech gets 403)
  fastify.post('/', {
    schema: {
      tags: ['Assignments'],
      summary: 'Create assignment',
      description: 'Create a new assignment. Requires supervisor, repair, or admin role. Supervisor can only assign to their team.',
      body: {
        type: 'object',
        required: ['propertyId', 'technicianId', 'scheduledDate'],
        properties: {
          propertyId: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
          technicianId: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174001' },
          scheduledDate: { type: 'string', format: 'date-time', example: '2026-02-01T09:00:00.000Z' },
          priority: { type: 'string', enum: ['low', 'med', 'high'], default: 'med' },
          notes: { type: 'string', example: 'Check chemical levels' },
        },
      },
      response: {
        201: { $ref: '#/components/schemas/Assignment' },
        400: { $ref: '#/components/schemas/Error' },
        403: { $ref: '#/components/schemas/Error' },
        404: { $ref: '#/components/schemas/Error' },
      },
    },
    preHandler: [fastify.requireRole(['supervisor', 'repair', 'admin'])],
  }, async (request, reply) => {
    const user = request.user;
    const result = createAssignmentSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { propertyId, technicianId, scheduledDate, priority, notes } = result.data;

    const property = await fastify.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      return notFound(reply, 'Property not found');
    }

    const technician = await fastify.prisma.user.findUnique({
      where: { id: technicianId },
      include: { technicianProfile: true },
    });
    if (!technician) {
      return notFound(reply, 'Technician not found');
    }

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
    schema: {
      tags: ['Assignments'],
      summary: 'Update assignment',
      description: 'Update assignment status/details. Tech can update status (pending->in_progress->completed) and notes. Supervisor can update scheduledDate, priority, notes, and cancel. Admin can update all fields. Both "cancelled" and "canceled" spellings are accepted.',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled', 'canceled'], description: 'Both "cancelled" and "canceled" are accepted, stored as "cancelled"' },
          priority: { type: 'string', enum: ['low', 'med', 'high'] },
          scheduledDate: { type: 'string', format: 'date-time' },
          technicianId: { type: 'string', format: 'uuid', description: 'Admin only' },
          notes: { type: 'string' },
          canceledReason: { type: 'string', description: 'Reason for cancellation' },
        },
      },
      response: {
        200: { $ref: '#/components/schemas/Assignment' },
        400: { $ref: '#/components/schemas/Error' },
        403: { $ref: '#/components/schemas/Error' },
        404: { $ref: '#/components/schemas/Error' },
      },
    },
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

    const isAdmin = user.role === 'admin';
    const isRepair = user.role === 'repair';
    const isSupervisor = user.role === 'supervisor';
    const isTech = user.role === 'tech';

    // Tech can only update their own assignments
    if (isTech && existing.technicianId !== user.sub) {
      return forbidden(reply, 'You can only update your own assignments');
    }

    // Supervisor can only update their team's assignments
    if (isSupervisor) {
      const techProfile = existing.technician.technicianProfile;
      if (!techProfile || techProfile.supervisorId !== user.sub) {
        return forbidden(reply, 'You can only update your team\'s assignments');
      }
    }

    // Normalize status spelling: "canceled" -> "cancelled"
    const normalizedBody = normalizeRequestBody(request.body);

    // TECH ROLE: Can only update status (pending -> in_progress -> completed) and notes
    if (isTech) {
      // Check if tech is trying to cancel first (explicit 403)
      if (normalizedBody.status === 'cancelled') {
        return forbidden(reply, 'Technicians cannot cancel assignments');
      }

      const result = techUpdateSchema.safeParse(normalizedBody);
      if (!result.success) {
        return badRequest(reply, 'Invalid request body', result.error.flatten());
      }

      // Check if tech is trying to update forbidden fields
      const forbiddenFields = ['priority', 'scheduledDate', 'technicianId', 'propertyId', 'canceledReason', 'canceledAt'];
      for (const field of forbiddenFields) {
        if (normalizedBody[field] !== undefined) {
          return forbidden(reply, `Technicians cannot update the '${field}' field`);
        }
      }

      // Validate status transitions for tech
      // Note: cancel check already done above before schema validation
      if (result.data.status) {
        const currentStatus = existing.status;
        const newStatus = result.data.status;

        // Valid transitions: pending -> in_progress -> completed
        const validTransitions: Record<string, string[]> = {
          pending: ['in_progress'],
          in_progress: ['completed'],
          completed: [],
          cancelled: [],
        };

        if (!validTransitions[currentStatus]?.includes(newStatus)) {
          return badRequest(reply, `Invalid status transition from '${currentStatus}' to '${newStatus}'`);
        }
      }

      const updateData: any = {};
      if (result.data.status) {
        updateData.status = result.data.status;
        if (result.data.status === 'completed') {
          updateData.completedAt = new Date();
        }
      }
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
    }

    // ADMIN / REPAIR ROLE - can update any field
    if (isAdmin || isRepair) {
      const result = adminUpdateSchema.safeParse(normalizedBody);
      if (!result.success) {
        return badRequest(reply, 'Invalid request body', result.error.flatten());
      }

      // If changing technician, verify the new tech exists
      if (result.data.technicianId) {
        const newTech = await fastify.prisma.user.findUnique({
          where: { id: result.data.technicianId },
          include: { technicianProfile: true },
        });
        if (!newTech) {
          return notFound(reply, 'Technician not found');
        }
      }

      const updateData: any = {};
      
      if (result.data.status === 'cancelled') {
        if (existing.status === 'cancelled') {
          return existing;
        }
        updateData.status = 'cancelled';
        updateData.canceledAt = new Date();
        updateData.completedAt = null;
        if (result.data.canceledReason) {
          updateData.canceledReason = result.data.canceledReason;
        }
      } else {
        if (result.data.status) updateData.status = result.data.status;
        if (result.data.priority) updateData.priority = result.data.priority;
        if (result.data.scheduledDate) updateData.scheduledDate = new Date(result.data.scheduledDate);
        if (result.data.technicianId) updateData.technicianId = result.data.technicianId;
        if (result.data.notes !== undefined) updateData.notes = result.data.notes;
        
        if (result.data.status === 'completed' && !existing.completedAt) {
          updateData.completedAt = new Date();
        }
      }

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
    }

    // SUPERVISOR ROLE - can only update scheduledDate, priority, notes, and cancel
    const result = supervisorUpdateSchema.safeParse(normalizedBody);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    // Block supervisor from updating forbidden fields
    const forbiddenFieldsSup = ['technicianId', 'propertyId', 'completedAt'];
    for (const field of forbiddenFieldsSup) {
      if (normalizedBody[field] !== undefined) {
        return forbidden(reply, `Supervisors cannot update the '${field}' field`);
      }
    }

    const updateData: any = {};
    
    if (result.data.status === 'cancelled') {
      if (existing.status === 'cancelled') {
        return existing;
      }
      updateData.status = 'cancelled';
      updateData.canceledAt = new Date();
      updateData.completedAt = null;
      if (result.data.canceledReason) {
        updateData.canceledReason = result.data.canceledReason;
      }
    } else {
      if (result.data.priority) updateData.priority = result.data.priority;
      if (result.data.scheduledDate) updateData.scheduledDate = new Date(result.data.scheduledDate);
      if (result.data.notes !== undefined) updateData.notes = result.data.notes;
    }

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
