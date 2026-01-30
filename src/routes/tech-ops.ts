import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound } from '../utils/errors';

// All entry types matching Admin App
const entryTypes = [
  'repairs_needed',
  'service_repairs',
  'chemical_order',
  'chemicals_dropoff',
  'windy_day_cleanup',
  'report_issue',
  'supervisor_concerns',
  'add_notes',
  'chemical_issue',
  'equipment_failure',
  'safety_concern',
  'general_note',
] as const;

const priorities = ['low', 'normal', 'high', 'urgent'] as const;
const statuses = ['pending', 'in_progress', 'reviewed', 'resolved', 'completed', 'cancelled', 'archived', 'dismissed'] as const;
const orderStatuses = ['pending', 'sent_to_vendor', 'confirmed', 'delivered'] as const;

const createTechOpsSchema = z.object({
  entryType: z.enum(entryTypes),
  technicianName: z.string().optional(),
  technicianId: z.string().optional().transform(val => val === '' ? undefined : val),
  positionType: z.string().optional(),
  propertyId: z.string().optional().transform(val => val === '' ? undefined : val),
  propertyName: z.string().optional(),
  propertyAddress: z.string().optional(),
  issueTitle: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  priority: z.enum(priorities).default('normal'),
  chemicals: z.string().optional(),
  quantity: z.string().optional(),
  issueType: z.string().optional(),
  photos: z.array(z.string()).optional(),
  vendorId: z.string().optional(),
  vendorName: z.string().optional(),
  partsCost: z.number().optional(),
});

const updateTechOpsSchema = z.object({
  status: z.enum(statuses).optional(),
  isRead: z.boolean().optional(),
  notes: z.string().optional(),
  priority: z.enum(priorities).optional(),
  reviewedBy: z.string().uuid().optional(),
  reviewedAt: z.string().datetime().optional(),
  resolvedBy: z.string().optional(),
  resolvedAt: z.string().datetime().optional(),
  resolutionNotes: z.string().optional(),
  // Vendor & order tracking
  vendorId: z.string().optional(),
  vendorName: z.string().optional(),
  orderStatus: z.enum(orderStatuses).optional(),
  // Cost tracking
  partsCost: z.number().optional(),
  commissionPercent: z.number().optional(),
  commissionAmount: z.number().optional(),
  // Estimate conversion
  convertedToEstimateId: z.string().optional(),
  convertedAt: z.string().datetime().optional(),
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
            enum: ['repairs_needed', 'service_repairs', 'chemical_order', 'chemicals_dropoff', 'windy_day_cleanup', 'report_issue', 'supervisor_concerns', 'add_notes', 'chemical_issue', 'equipment_failure', 'safety_concern', 'general_note'],
            description: 'Filter by entry type',
          },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'reviewed', 'resolved', 'completed', 'cancelled', 'archived', 'dismissed'],
            description: 'Filter by status',
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high', 'urgent'],
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
        // property relation removed - propertyId/propertyName/propertyAddress stored directly
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
        // property relation removed - propertyId/propertyName/propertyAddress stored directly
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
        required: ['entryType'],
        properties: {
          entryType: {
            type: 'string',
            enum: ['repairs_needed', 'service_repairs', 'chemical_order', 'chemicals_dropoff', 'windy_day_cleanup', 'report_issue', 'supervisor_concerns', 'add_notes', 'chemical_issue', 'equipment_failure', 'safety_concern', 'general_note'],
          },
          technicianName: { type: 'string' },
          technicianId: { type: 'string' },
          positionType: { type: 'string' },
          propertyId: { type: 'string' },
          propertyName: { type: 'string' },
          propertyAddress: { type: 'string' },
          issueTitle: { type: 'string' },
          description: { type: 'string' },
          notes: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
          chemicals: { type: 'string' },
          quantity: { type: 'string' },
          issueType: { type: 'string' },
          photos: { type: 'array', items: { type: 'string' } },
          vendorId: { type: 'string' },
          vendorName: { type: 'string' },
          partsCost: { type: 'number' },
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

    // Validate propertyId - set to null if it doesn't exist in database
    let validPropertyId = data.propertyId;
    if (data.propertyId) {
      const propertyExists = await fastify.prisma.property.findUnique({
        where: { id: data.propertyId },
        select: { id: true },
      });
      if (!propertyExists) {
        validPropertyId = null;
      }
    }

    const entry = await fastify.prisma.techOpsEntry.create({
      data: {
        entryType: data.entryType,
        technicianName,
        technicianId,
        positionType: data.positionType,
        propertyId: validPropertyId,
        propertyName: data.propertyName,
        propertyAddress: data.propertyAddress,
        issueTitle: data.issueTitle,
        description: data.description,
        notes: data.notes,
        priority: data.priority,
        chemicals: data.chemicals,
        quantity: data.quantity,
        issueType: data.issueType,
        photos: data.photos || [],
        vendorId: data.vendorId,
        vendorName: data.vendorName,
        partsCost: data.partsCost,
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
        // property relation removed - propertyId/propertyName/propertyAddress stored directly
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
          status: { type: 'string', enum: ['pending', 'in_progress', 'reviewed', 'resolved', 'completed', 'cancelled', 'archived', 'dismissed'] },
          isRead: { type: 'boolean' },
          notes: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
          resolvedBy: { type: 'string' },
          resolutionNotes: { type: 'string' },
          vendorId: { type: 'string' },
          vendorName: { type: 'string' },
          orderStatus: { type: 'string', enum: ['pending', 'sent_to_vendor', 'confirmed', 'delivered'] },
          partsCost: { type: 'number' },
          commissionPercent: { type: 'number' },
          commissionAmount: { type: 'number' },
          convertedToEstimateId: { type: 'string' },
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

    // Handle datetime conversions
    if (updateData.convertedAt) {
      updateData.convertedAt = new Date(updateData.convertedAt);
    }

    // If status is being changed to resolved, completed, or dismissed, mark as reviewed
    if (['resolved', 'completed', 'dismissed', 'archived'].includes(updateData.status)) {
      updateData.reviewedBy = user.sub;
      updateData.reviewedAt = new Date();

      if (updateData.status === 'resolved' || updateData.status === 'completed') {
        updateData.resolvedAt = new Date();
      }
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
        // property relation removed - propertyId/propertyName/propertyAddress stored directly
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

  // POST /api/tech-ops/:id/review - Mark entry as reviewed
  fastify.post('/:id/review', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
    schema: {
      tags: ['TechOps'],
      summary: 'Mark tech ops entry as reviewed',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const entry = await fastify.prisma.techOpsEntry.update({
      where: { id },
      data: {
        status: 'reviewed',
        isRead: true,
        reviewedBy: user.sub,
        reviewedAt: new Date(),
      },
    });
    return entry;
  });

  // POST /api/tech-ops/:id/archive - Archive entry
  fastify.post('/:id/archive', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
    schema: {
      tags: ['TechOps'],
      summary: 'Archive tech ops entry',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const entry = await fastify.prisma.techOpsEntry.update({
      where: { id },
      data: {
        status: 'archived',
        reviewedBy: user.sub,
        reviewedAt: new Date(),
      },
    });
    return entry;
  });

  // POST /api/tech-ops/:id/no-charge - Mark as completed with no charge
  fastify.post('/:id/no-charge', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
    schema: {
      tags: ['TechOps'],
      summary: 'Mark entry as completed with no charge',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const entry = await fastify.prisma.techOpsEntry.update({
      where: { id },
      data: {
        status: 'completed',
        reviewedBy: user.sub,
        reviewedAt: new Date(),
        resolvedAt: new Date(),
        resolutionNotes: 'No charge',
      },
    });
    return entry;
  });

  // POST /api/tech-ops/:id/assign-vendor - Assign vendor to chemical order
  fastify.post('/:id/assign-vendor', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
    schema: {
      tags: ['TechOps'],
      summary: 'Assign vendor to chemical order',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['vendorId', 'vendorName'],
        properties: {
          vendorId: { type: 'string' },
          vendorName: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { vendorId, vendorName } = request.body as { vendorId: string; vendorName: string };

    const entry = await fastify.prisma.techOpsEntry.update({
      where: { id },
      data: { vendorId, vendorName },
    });
    return entry;
  });

  // POST /api/tech-ops/:id/update-order-status - Update order status
  fastify.post('/:id/update-order-status', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
    schema: {
      tags: ['TechOps'],
      summary: 'Update chemical order status',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['orderStatus'],
        properties: {
          orderStatus: { type: 'string', enum: ['pending', 'sent_to_vendor', 'confirmed', 'delivered'] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orderStatus } = request.body as { orderStatus: string };

    const updateData: any = { orderStatus };
    if (orderStatus === 'delivered') {
      updateData.status = 'completed';
      updateData.resolvedAt = new Date();
    }

    const entry = await fastify.prisma.techOpsEntry.update({
      where: { id },
      data: updateData,
    });
    return entry;
  });

  // POST /api/tech-ops/:id/convert-to-estimate - Convert to estimate
  fastify.post('/:id/convert-to-estimate', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
    schema: {
      tags: ['TechOps'],
      summary: 'Convert tech ops entry to estimate',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        properties: {
          urgent: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { urgent } = (request.body || {}) as { urgent?: boolean };
    const user = request.user!;

    // For now, just mark as converted - estimate creation would be handled separately
    const entry = await fastify.prisma.techOpsEntry.update({
      where: { id },
      data: {
        status: 'completed',
        convertedAt: new Date(),
        reviewedBy: user.sub,
        reviewedAt: new Date(),
        priority: urgent ? 'urgent' : undefined,
      },
    });
    return { ...entry, estimateNumber: `EST-${id.slice(0, 8)}` };
  });

  // GET /api/tech-ops/windy-day-pending-count - Get pending windy day count
  fastify.get('/windy-day-pending-count', {
    preHandler: [fastify.requireAuth],
    schema: {
      tags: ['TechOps'],
      summary: 'Get count of pending windy day cleanup entries',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const count = await fastify.prisma.techOpsEntry.count({
      where: {
        entryType: 'windy_day_cleanup',
        status: 'pending',
      },
    });
    return { count };
  });
};

export default techOpsRoutes;
