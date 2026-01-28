import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound } from '../utils/errors';

const createTechOpsSchema = z.object({
  entryType: z.enum(['repairs_needed', 'chemical_issue', 'equipment_failure', 'safety_concern', 'general_note']),
  technicianName: z.string().optional(),
  technicianId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  propertyName: z.string().optional(),
  propertyAddress: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  notes: z.string().optional(),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  chemicals: z.any().optional(),
  quantity: z.number().optional(),
  issueType: z.string().optional(),
  photos: z.array(z.string()).optional(),
});

const updateTechOpsSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'resolved', 'dismissed']).optional(),
  isRead: z.boolean().optional(),
  notes: z.string().optional(),
  reviewedBy: z.string().uuid().optional(),
  reviewedAt: z.string().datetime().optional(),
});

const techOpsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/tech-ops - List tech ops entries with optional filters
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
    schema: {
      tags: ['TechOps'],
      summary: 'List tech ops entries',
      description: 'Get all tech ops entries with optional filters. Returns newest first.',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          entryType: {
            type: 'string',
            enum: ['repairs_needed', 'chemical_issue', 'equipment_failure', 'safety_concern', 'general_note'],
            description: 'Filter by entry type',
          },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'resolved', 'dismissed'],
            description: 'Filter by status',
          },
          priority: {
            type: 'string',
            enum: ['normal', 'urgent'],
            description: 'Filter by priority',
          },
          propertyId: {
            type: 'string',
            format: 'uuid',
            description: 'Filter by property ID',
          },
          technicianName: {
            type: 'string',
            description: 'Filter by technician name (partial match)',
          },
          startDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter entries created on or after this date',
          },
          endDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter entries created on or before this date',
          },
          isRead: {
            type: 'boolean',
            description: 'Filter by read status',
          },
        },
      },
      response: {
        200: {
          type: 'array',
          items: { $ref: 'TechOpsEntry#' },
        },
      },
    },
  }, async (request, reply) => {
    const query = request.query as {
      entryType?: string;
      status?: string;
      priority?: string;
      propertyId?: string;
      technicianName?: string;
      startDate?: string;
      endDate?: string;
      isRead?: boolean;
    };

    const where: any = {};

    if (query.entryType) {
      where.entryType = query.entryType;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }
    if (query.technicianName) {
      where.technicianName = {
        contains: query.technicianName,
        mode: 'insensitive',
      };
    }
    if (query.isRead !== undefined) {
      where.isRead = query.isRead;
    }

    // Date range filters
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    const entries = await fastify.prisma.techOpsEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        technician: {
          select: {
            id: true,
            email: true,
            technicianProfile: {
              select: {
                name: true,
              },
            },
          },
        },
        reviewer: {
          select: {
            id: true,
            email: true,
            technicianProfile: {
              select: {
                name: true,
              },
            },
          },
        },
        property: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    return entries;
  });

  // GET /api/tech-ops/:id - Get single tech ops entry
  fastify.get('/:id', {
    preHandler: [fastify.requireAuth],
    schema: {
      tags: ['TechOps'],
      summary: 'Get tech ops entry by ID',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: { $ref: 'TechOpsEntry#' },
        404: { $ref: 'Error#' },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const entry = await fastify.prisma.techOpsEntry.findUnique({
      where: { id },
      include: {
        technician: {
          select: {
            id: true,
            email: true,
            technicianProfile: {
              select: {
                name: true,
              },
            },
          },
        },
        reviewer: {
          select: {
            id: true,
            email: true,
            technicianProfile: {
              select: {
                name: true,
              },
            },
          },
        },
        property: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    if (!entry) {
      return notFound(reply, 'Tech ops entry not found');
    }

    return entry;
  });

  // POST /api/tech-ops - Create new tech ops entry
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
    schema: {
      tags: ['TechOps'],
      summary: 'Create tech ops entry',
      description: 'Create a new tech ops entry (e.g., repairs_needed)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['entryType', 'description'],
        properties: {
          entryType: {
            type: 'string',
            enum: ['repairs_needed', 'chemical_issue', 'equipment_failure', 'safety_concern', 'general_note'],
          },
          technicianName: { type: 'string' },
          technicianId: { type: 'string', format: 'uuid' },
          propertyId: { type: 'string', format: 'uuid' },
          propertyName: { type: 'string' },
          propertyAddress: { type: 'string' },
          description: { type: 'string', minLength: 1 },
          notes: { type: 'string' },
          priority: { type: 'string', enum: ['normal', 'urgent'], default: 'normal' },
          chemicals: { type: 'object' },
          quantity: { type: 'number' },
          issueType: { type: 'string' },
          photos: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        201: { $ref: 'TechOpsEntry#' },
        400: { $ref: 'Error#' },
      },
    },
  }, async (request, reply) => {
    const parsed = createTechOpsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0].message,
      });
    }

    const data = parsed.data;
    const user = request.user!;

    // If no technicianId provided and user is a tech, use current user
    let technicianId = data.technicianId;
    let technicianName = data.technicianName;

    if (!technicianId && user.role === 'tech') {
      technicianId = user.sub;
      // Fetch technician profile name if not provided
      if (!technicianName) {
        const profile = await fastify.prisma.technicianProfile.findUnique({
          where: { userId: user.sub },
        });
        technicianName = profile?.name || undefined;
      }
    }

    const entry = await fastify.prisma.techOpsEntry.create({
      data: {
        entryType: data.entryType,
        technicianName,
        technicianId,
        propertyId: data.propertyId,
        propertyName: data.propertyName,
        propertyAddress: data.propertyAddress,
        description: data.description,
        notes: data.notes,
        priority: data.priority,
        chemicals: data.chemicals,
        quantity: data.quantity,
        issueType: data.issueType,
        photos: data.photos || [],
      },
      include: {
        technician: {
          select: {
            id: true,
            email: true,
            technicianProfile: {
              select: {
                name: true,
              },
            },
          },
        },
        property: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    return reply.status(201).send(entry);
  });

  // PATCH /api/tech-ops/:id - Update tech ops entry
  fastify.patch('/:id', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
    schema: {
      tags: ['TechOps'],
      summary: 'Update tech ops entry',
      description: 'Update status, mark as read, or add review info',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'in_progress', 'resolved', 'dismissed'] },
          isRead: { type: 'boolean' },
          notes: { type: 'string' },
        },
      },
      response: {
        200: { $ref: 'TechOpsEntry#' },
        400: { $ref: 'Error#' },
        404: { $ref: 'Error#' },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateTechOpsSchema.safeParse(request.body);
    
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0].message,
      });
    }

    const existing = await fastify.prisma.techOpsEntry.findUnique({ where: { id } });
    if (!existing) {
      return notFound(reply, 'Tech ops entry not found');
    }

    const user = request.user!;
    const updateData: any = { ...parsed.data };

    // If status is being changed to resolved or dismissed, mark as reviewed
    if (updateData.status === 'resolved' || updateData.status === 'dismissed') {
      updateData.reviewedBy = user.sub;
      updateData.reviewedAt = new Date();
    }

    const entry = await fastify.prisma.techOpsEntry.update({
      where: { id },
      data: updateData,
      include: {
        technician: {
          select: {
            id: true,
            email: true,
            technicianProfile: {
              select: {
                name: true,
              },
            },
          },
        },
        reviewer: {
          select: {
            id: true,
            email: true,
            technicianProfile: {
              select: {
                name: true,
              },
            },
          },
        },
        property: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    return entry;
  });

  // DELETE /api/tech-ops/:id - Delete tech ops entry (admin only)
  fastify.delete('/:id', {
    preHandler: [fastify.requireRole(['admin'])],
    schema: {
      tags: ['TechOps'],
      summary: 'Delete tech ops entry',
      description: 'Permanently delete a tech ops entry (admin only)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        204: { type: 'null' },
        404: { $ref: 'Error#' },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await fastify.prisma.techOpsEntry.findUnique({ where: { id } });
    if (!existing) {
      return notFound(reply, 'Tech ops entry not found');
    }

    await fastify.prisma.techOpsEntry.delete({ where: { id } });
    return reply.status(204).send();
  });
};

export default techOpsRoutes;
