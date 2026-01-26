import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';
import { parseLimit, parseUpdatedSince, buildPaginatedResponse } from '../utils/pagination';

const createPropertySchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  region: z.enum(['north', 'mid', 'south']).optional(),
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
    schema: {
      tags: ['Properties'],
      summary: 'List properties with pagination',
      description: 'Get properties with cursor pagination and incremental sync support. Tech sees assigned properties, supervisor sees team/region properties, admin sees all.',
      querystring: {
        type: 'object',
        properties: {
          updatedSince: { type: 'string', format: 'date-time', description: 'ISO timestamp to filter properties updated after this time' },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50, description: 'Number of items per page (default 50, max 200)' },
          cursor: { type: 'string', format: 'uuid', description: 'Cursor for pagination (property ID)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: 'Property#' } },
            nextCursor: { type: 'string', nullable: true, description: 'Cursor for next page, null if no more results' },
          },
        },
        401: { $ref: 'Error#' },
      },
    },
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const user = request.user;
    const query = request.query as { updatedSince?: string; limit?: string; cursor?: string };
    
    const limit = parseLimit(query.limit);
    const updatedSince = parseUpdatedSince(query.updatedSince);
    const cursor = query.cursor;

    if (user.role === 'tech') {
      const assignments = await fastify.prisma.assignment.findMany({
        where: { technicianId: user.sub },
        select: { propertyId: true },
      });

      const propertyIds = [...new Set(assignments.map(a => a.propertyId))];

      if (propertyIds.length === 0) {
        return { items: [], nextCursor: null };
      }

      const where: any = { id: { in: propertyIds } };
      if (updatedSince) {
        where.updatedAt = { gt: updatedSince };
      }

      const properties = await fastify.prisma.property.findMany({
        where,
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      return buildPaginatedResponse(properties, limit);
    }

    if (user.role === 'supervisor') {
      const supervisorProfile = await fastify.prisma.technicianProfile.findUnique({
        where: { userId: user.sub },
      });

      const teamAssignments = await fastify.prisma.assignment.findMany({
        where: {
          technician: {
            technicianProfile: {
              supervisorId: user.sub,
            },
          },
        },
        select: { propertyId: true },
      });

      const assignedPropertyIds = [...new Set(teamAssignments.map(a => a.propertyId))];

      const propertyWhere: any = {};
      
      if (assignedPropertyIds.length > 0 && supervisorProfile?.region) {
        propertyWhere.OR = [
          { id: { in: assignedPropertyIds } },
          { region: supervisorProfile.region },
        ];
      } else if (assignedPropertyIds.length > 0) {
        propertyWhere.id = { in: assignedPropertyIds };
      } else if (supervisorProfile?.region) {
        propertyWhere.region = supervisorProfile.region;
      } else {
        return { items: [], nextCursor: null };
      }

      if (updatedSince) {
        propertyWhere.updatedAt = { gt: updatedSince };
      }

      const properties = await fastify.prisma.property.findMany({
        where: propertyWhere,
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      return buildPaginatedResponse(properties, limit);
    }

    // Admin can see all properties
    const where: any = {};
    if (updatedSince) {
      where.updatedAt = { gt: updatedSince };
    }

    const properties = await fastify.prisma.property.findMany({
      where,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    return buildPaginatedResponse(properties, limit);
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
        assignments: {
          include: {
            technician: {
              include: { technicianProfile: true },
            },
          },
        },
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

    // Supervisor can only see properties tied to their team or their region
    if (user.role === 'supervisor') {
      const supervisorProfile = await fastify.prisma.technicianProfile.findUnique({
        where: { userId: user.sub },
      });

      const hasTeamAssignment = property.assignments.some(
        a => a.technician.technicianProfile?.supervisorId === user.sub
      );
      const matchesRegion = supervisorProfile?.region && property.region === supervisorProfile.region;

      if (!hasTeamAssignment && !matchesRegion) {
        return notFound(reply, 'Property not found');
      }
    }

    // Remove technician details from response to keep it clean
    const { assignments, ...propertyData } = property;
    return {
      ...propertyData,
      assignments: assignments.map(a => ({
        id: a.id,
        propertyId: a.propertyId,
        technicianId: a.technicianId,
        status: a.status,
        priority: a.priority,
        scheduledDate: a.scheduledDate,
        completedAt: a.completedAt,
        notes: a.notes,
      })),
    };
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
