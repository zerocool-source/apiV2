import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createTimeEntrySchema = z.object({
  jobId: z.string().uuid(),
  minutes: z.number().int().min(1),
  notes: z.string().optional(),
});

const timeEntriesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/time-entries
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { jobId?: string; userId?: string };
    const user = request.user;

    const where: any = {};
    
    // Regular techs can only see their own entries
    if (user.role === 'tech' || user.role === 'repair') {
      where.userId = user.sub;
    } else if (query.userId) {
      where.userId = query.userId;
    }

    if (query.jobId) {
      where.jobId = query.jobId;
    }

    const timeEntries = await fastify.prisma.timeEntry.findMany({
      where,
      include: {
        job: {
          include: {
            property: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return timeEntries;
  });

  // POST /api/time-entries
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = createTimeEntrySchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { jobId, minutes, notes } = result.data;
    const userId = request.user.sub;

    // Verify job exists
    const job = await fastify.prisma.job.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      return notFound(reply, 'Job not found');
    }

    const timeEntry = await fastify.prisma.timeEntry.create({
      data: {
        jobId,
        userId,
        minutes,
        notes,
      },
      include: {
        job: {
          include: {
            property: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
    });

    return reply.status(201).send(timeEntry);
  });
};

export default timeEntriesRoutes;
