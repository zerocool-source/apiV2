import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createEstimateSchema = z.object({
  jobId: z.string().uuid(),
  lines: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    total: z.number(),
  })),
  total: z.number(),
});

const estimatesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/estimates
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { jobId?: string };
    
    const where: any = {};
    if (query.jobId) {
      where.jobId = query.jobId;
    }

    const estimates = await fastify.prisma.estimate.findMany({
      where,
      include: {
        job: {
          include: {
            property: true,
          },
        },
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

    return estimates;
  });

  // POST /api/estimates
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = createEstimateSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { jobId, lines, total } = result.data;
    const createdBy = request.user.sub;

    // Verify job exists
    const job = await fastify.prisma.job.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      return notFound(reply, 'Job not found');
    }

    const estimate = await fastify.prisma.estimate.create({
      data: {
        jobId,
        createdBy,
        lines,
        total,
      },
      include: {
        job: {
          include: {
            property: true,
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
    });

    return reply.status(201).send(estimate);
  });
};

export default estimatesRoutes;
