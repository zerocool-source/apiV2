import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../utils/errors';

const createRepairRequestSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  propertyId: z.string().uuid(),
  propertyName: z.string().min(1),
  jobType: z.string().optional(),
  technicianId: z.string().uuid().optional(),
  scheduledDate: z.string().datetime().optional(),
});

const repairRequestsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/repair-requests - Create a repair request
  fastify.post('/', {
    preHandler: [fastify.requireRole(['tech', 'repair', 'supervisor', 'admin', 'foreman'])],
    schema: {
      tags: ['Repair Requests'],
      summary: 'Create a repair request',
      description: 'Create a new repair request entry in techOpsEntries with entryType = repair_request.',
      body: {
        type: 'object',
        required: ['title', 'propertyId', 'propertyName'],
        properties: {
          title: { type: 'string' },
          notes: { type: 'string' },
          propertyId: { type: 'string', format: 'uuid' },
          propertyName: { type: 'string' },
          jobType: { type: 'string' },
          technicianId: { type: 'string', format: 'uuid' },
          scheduledDate: { type: 'string', format: 'date-time' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            entryType: { type: 'string' },
            issueTitle: { type: 'string' },
            propertyId: { type: 'string' },
            propertyName: { type: 'string' },
            technicianId: { type: 'string' },
            scheduledDate: { type: 'string' },
            status: { type: 'string' },
            createdAt: { type: 'string' },
          },
        },
        400: { $ref: 'Error#' },
      },
    },
  }, async (request, reply) => {
    const result = createRepairRequestSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { title, notes, propertyId, propertyName, jobType, technicianId, scheduledDate } = result.data;
    const userId = request.user.sub;

    // Get property address if available
    let propertyAddress: string | undefined;
    try {
      const property = await fastify.prisma.property.findUnique({
        where: { id: propertyId },
        select: { address: true },
      });
      propertyAddress = property?.address;
    } catch (e) {
      // Property might not exist, continue without address
    }

    // Get technician name if technicianId provided
    let technicianName: string | undefined;
    if (technicianId) {
      const tech = await fastify.prisma.technicianProfile.findFirst({
        where: { userId: technicianId },
        select: { name: true },
      });
      technicianName = tech?.name;
    }

    const entry = await fastify.prisma.techOpsEntry.create({
      data: {
        entryType: 'repair_request',
        issueTitle: title,
        notes,
        propertyId,
        propertyName,
        propertyAddress,
        technicianId,
        technicianName,
        description: jobType,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        creatorId: userId,
        status: 'pending',
      },
    });

    return reply.status(201).send({
      id: entry.id,
      entryType: entry.entryType,
      issueTitle: entry.issueTitle,
      propertyId: entry.propertyId,
      propertyName: entry.propertyName,
      technicianId: entry.technicianId,
      scheduledDate: entry.scheduledDate?.toISOString(),
      status: entry.status,
      createdAt: entry.createdAt.toISOString(),
    });
  });

  // GET /api/repair-requests - List repair requests
  fastify.get('/', {
    preHandler: [fastify.requireRole(['tech', 'repair', 'supervisor', 'admin', 'foreman'])],
    schema: {
      tags: ['Repair Requests'],
      summary: 'List repair requests',
      description: 'Get all repair request entries.',
      querystring: {
        type: 'object',
        properties: {
          technicianId: { type: 'string' },
          status: { type: 'string' },
          limit: { type: 'integer', default: 50 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  entryType: { type: 'string' },
                  issueTitle: { type: 'string' },
                  propertyId: { type: 'string' },
                  propertyName: { type: 'string' },
                  technicianId: { type: 'string' },
                  technicianName: { type: 'string' },
                  scheduledDate: { type: 'string' },
                  status: { type: 'string' },
                  createdAt: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const query = request.query as { technicianId?: string; status?: string; limit?: number };

    const where: any = {
      entryType: 'repair_request',
    };

    if (query.technicianId) {
      where.technicianId = query.technicianId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const entries = await fastify.prisma.techOpsEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit || 50,
    });

    return {
      items: entries.map(e => ({
        id: e.id,
        entryType: e.entryType,
        issueTitle: e.issueTitle,
        propertyId: e.propertyId,
        propertyName: e.propertyName,
        technicianId: e.technicianId,
        technicianName: e.technicianName,
        scheduledDate: e.scheduledDate?.toISOString(),
        status: e.status,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });
};

export default repairRequestsRoutes;
