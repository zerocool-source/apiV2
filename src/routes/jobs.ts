import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound, forbidden } from '../utils/errors';

const dismissJobSchema = z.object({
  reason: z.string().optional(),
});

async function notifyAdminsOfJobAction(
  prisma: any,
  action: 'accepted' | 'dismissed',
  jobId: string,
  jobType: string,
  propertyName: string,
  technicianName: string,
  technicianId: string,
  reason?: string
) {
  const adminsAndSupervisors = await prisma.user.findMany({
    where: {
      role: { in: ['admin', 'supervisor'] },
    },
    select: { id: true },
  });

  const title = action === 'accepted' 
    ? `Job Accepted: ${jobType}`
    : `Job Dismissed: ${jobType}`;

  const message = action === 'accepted'
    ? `${technicianName} has accepted the ${jobType} job at ${propertyName}.`
    : `${technicianName} has dismissed the ${jobType} job at ${propertyName}.${reason ? ` Reason: ${reason}` : ''} This job needs to be reassigned.`;

  const alert = await prisma.alert.create({
    data: {
      createdBy: technicianId,
      title,
      message,
      severity: action === 'dismissed' ? 'warning' : 'info',
      audience: ['admin', 'supervisor'],
    },
  });

  const messagePromises = adminsAndSupervisors.map((user: { id: string }) =>
    prisma.message.create({
      data: {
        fromUserId: technicianId,
        toUserId: user.id,
        text: message,
      },
    })
  );

  await Promise.all(messagePromises);

  return alert;
}

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

  // PATCH /api/jobs/:id/accept
  fastify.patch('/:id/accept', {
    preHandler: [fastify.requireAuth],
    schema: {
      tags: ['Jobs'],
      summary: 'Accept a job',
      description: 'Technician accepts a pending job, changing status to in_progress.',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string' },
            status: { type: 'string' },
            acceptedAt: { type: 'string' },
            propertyId: { type: 'string' },
            assignedToUserId: { type: 'string' },
          },
        },
        400: { $ref: 'Error#' },
        401: { $ref: 'Error#' },
        403: { $ref: 'Error#' },
        404: { $ref: 'Error#' },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const job = await fastify.prisma.job.findUnique({
      where: { id },
      include: {
        property: true,
      },
    });

    if (!job) {
      return notFound(reply, 'Job not found');
    }

    if (job.assignedToUserId !== userId) {
      return forbidden(reply, 'You are not assigned to this job');
    }

    if (job.status !== 'pending') {
      return badRequest(reply, `Job cannot be accepted. Current status: ${job.status}`);
    }

    const techProfile = await fastify.prisma.technicianProfile.findFirst({
      where: { userId },
      select: { name: true },
    });

    const updatedJob = await fastify.prisma.job.update({
      where: { id },
      data: {
        status: 'in_progress',
        acceptedAt: new Date(),
      },
    });

    await notifyAdminsOfJobAction(
      fastify.prisma,
      'accepted',
      job.id,
      job.type,
      job.property.name,
      techProfile?.name || 'Unknown Technician',
      userId
    );

    return {
      id: updatedJob.id,
      type: updatedJob.type,
      status: updatedJob.status,
      acceptedAt: updatedJob.acceptedAt?.toISOString(),
      propertyId: updatedJob.propertyId,
      assignedToUserId: updatedJob.assignedToUserId,
    };
  });

  // PATCH /api/jobs/:id/dismiss
  fastify.patch('/:id/dismiss', {
    preHandler: [fastify.requireAuth],
    schema: {
      tags: ['Jobs'],
      summary: 'Dismiss a job',
      description: 'Technician dismisses a job, unassigning themselves so it can be reassigned.',
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
          reason: { type: 'string', description: 'Optional reason for dismissing the job' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string' },
            status: { type: 'string' },
            dismissedAt: { type: 'string' },
            dismissedReason: { type: 'string' },
            propertyId: { type: 'string' },
            assignedToUserId: { type: 'string', nullable: true },
          },
        },
        400: { $ref: 'Error#' },
        401: { $ref: 'Error#' },
        403: { $ref: 'Error#' },
        404: { $ref: 'Error#' },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const body = dismissJobSchema.safeParse(request.body);
    const reason = body.success ? body.data.reason : undefined;

    const job = await fastify.prisma.job.findUnique({
      where: { id },
      include: {
        property: true,
      },
    });

    if (!job) {
      return notFound(reply, 'Job not found');
    }

    if (job.assignedToUserId !== userId) {
      return forbidden(reply, 'You are not assigned to this job');
    }

    const techProfile = await fastify.prisma.technicianProfile.findFirst({
      where: { userId },
      select: { name: true },
    });

    const updatedJob = await fastify.prisma.job.update({
      where: { id },
      data: {
        assignedToUserId: null,
        dismissedAt: new Date(),
        dismissedReason: reason,
        status: 'pending',
      },
    });

    await notifyAdminsOfJobAction(
      fastify.prisma,
      'dismissed',
      job.id,
      job.type,
      job.property.name,
      techProfile?.name || 'Unknown Technician',
      userId,
      reason
    );

    return {
      id: updatedJob.id,
      type: updatedJob.type,
      status: updatedJob.status,
      dismissedAt: updatedJob.dismissedAt?.toISOString(),
      dismissedReason: updatedJob.dismissedReason,
      propertyId: updatedJob.propertyId,
      assignedToUserId: updatedJob.assignedToUserId,
    };
  });
};

export default jobsRoutes;
