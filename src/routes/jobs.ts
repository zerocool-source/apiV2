import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createJobSchema = z.object({
  type: z.enum(['repair', 'maintenance', 'inspection']),
  propertyId: z.string().uuid(),
  assignedToUserId: z.string().uuid(),
});

const updateJobSchema = z.object({
  status: z.enum(['pending', 'assigned', 'in_progress', 'completed', 'cancelled']).optional(),
  assignedToUserId: z.string().uuid().optional(),
});

const jobsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/jobs
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { type?: string; status?: string; assignedToUserId?: string };
    const user = request.user;

    const where: any = {};
    
    // Repair techs can only see their own jobs
    if (user.role === 'repair') {
      where.assignedToUserId = user.sub;
    } else if (query.assignedToUserId) {
      where.assignedToUserId = query.assignedToUserId;
    }

    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
    }

    const jobs = await fastify.prisma.job.findMany({
      where,
      include: {
        property: true,
        assignedTo: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
        estimates: true,
        timeEntries: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return jobs;
  });

  // GET /api/jobs/:id
  fastify.get('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const job = await fastify.prisma.job.findUnique({
      where: { id },
      include: {
        property: true,
        assignedTo: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
        estimates: true,
        timeEntries: true,
      },
    });

    if (!job) {
      return notFound(reply, 'Job not found');
    }

    return job;
  });

  // POST /api/jobs
  fastify.post('/', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async (request, reply) => {
    const result = createJobSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { type, propertyId, assignedToUserId } = result.data;

    // Verify property exists
    const property = await fastify.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      return notFound(reply, 'Property not found');
    }

    const job = await fastify.prisma.job.create({
      data: {
        type,
        propertyId,
        assignedToUserId,
      },
      include: {
        property: true,
        assignedTo: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
    });

    return reply.status(201).send(job);
  });

  // PATCH /api/jobs/:id
  fastify.patch('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = updateJobSchema.safeParse(request.body);
    
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const existing = await fastify.prisma.job.findUnique({
      where: { id },
    });

    if (!existing) {
      return notFound(reply, 'Job not found');
    }

    const job = await fastify.prisma.job.update({
      where: { id },
      data: result.data,
      include: {
        property: true,
        assignedTo: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
    });

    return job;
  });
};

export default jobsRoutes;
