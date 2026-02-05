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

  // GET /api/jobs/team - For foremen/supervisors to see their team's jobs
  fastify.get('/team', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { type?: string; status?: string; startDate?: string; endDate?: string };
    const user = request.user;

    // Only supervisors, foremen, and admins can see team jobs
    if (!['supervisor', 'repair', 'admin'].includes(user.role)) {
      return [];
    }

    // Get team members supervised by this user
    const teamMembers = await fastify.prisma.technicianProfile.findMany({
      where: { supervisorId: user.sub },
      select: { userId: true, name: true },
    });

    const teamUserIds = teamMembers.map(t => t.userId).filter(Boolean) as string[];
    teamUserIds.push(user.sub); // Include self

    const where: any = {
      assignedToUserId: { in: teamUserIds },
    };

    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.startDate && query.endDate) {
      where.scheduledDate = {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      };
    }

    const jobs = await fastify.prisma.job.findMany({
      where,
      include: {
        property: {
          select: { id: true, name: true, address: true },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            technicianProfile: {
              select: { name: true, phone: true },
            },
          },
        },
      },
      orderBy: { scheduledDate: 'asc' },
    });

    // Format response with tech names
    return jobs.map(job => ({
      ...job,
      assignedTechName: job.assignedTo?.technicianProfile?.name || 'Unassigned',
      propertyName: job.property?.name || 'Unknown Property',
      propertyAddress: job.property?.address || '',
    }));
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

  // PATCH /api/jobs/:id/accept - Tech accepts a job
  fastify.patch('/:id/accept', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const job = await fastify.prisma.job.findUnique({
      where: { id },
      include: {
        property: { select: { name: true, address: true } },
      },
    });

    if (!job) {
      return notFound(reply, 'Job not found');
    }

    // Check if job is assigned to this tech
    if (job.assignedToUserId !== user.sub) {
      return badRequest(reply, 'You can only accept jobs assigned to you');
    }

    // Check if job is in pending/assigned status
    if (!['pending', 'assigned'].includes(job.status)) {
      return badRequest(reply, `Cannot accept job with status: ${job.status}`);
    }

    // Update job status
    const updatedJob = await fastify.prisma.job.update({
      where: { id },
      data: {
        status: 'in_progress',
        acceptedAt: new Date(),
      },
      include: {
        property: { select: { name: true, address: true } },
      },
    });

    // Get tech name for notification
    const techProfile = await fastify.prisma.technicianProfile.findUnique({
      where: { userId: user.sub },
      select: { name: true },
    });
    const techName = techProfile?.name || 'Technician';

    // Notify admins
    try {
      const admins = await fastify.prisma.user.findMany({
        where: { role: { in: ['admin', 'supervisor'] } },
        select: { id: true },
      });

      await fastify.prisma.urgentNotification.create({
        data: {
          title: 'Job Accepted',
          message: `${techName} accepted job at ${job.property?.name || 'property'}`,
          severity: 'info',
          targetRole: 'admin',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      console.log(`[NOTIFICATION] Job ${id} accepted by ${techName}`);
    } catch (notifError) {
      console.error('Failed to create admin notification:', notifError);
    }

    return { success: true, message: 'Job accepted', job: updatedJob };
  });

  // PATCH /api/jobs/:id/dismiss - Tech dismisses a job
  fastify.patch('/:id/dismiss', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason?: string };
    const user = request.user;

    const job = await fastify.prisma.job.findUnique({
      where: { id },
      include: {
        property: { select: { name: true, address: true } },
      },
    });

    if (!job) {
      return notFound(reply, 'Job not found');
    }

    // Check if job is assigned to this tech
    if (job.assignedToUserId !== user.sub) {
      return badRequest(reply, 'You can only dismiss jobs assigned to you');
    }

    // Check if job can be dismissed
    if (!['pending', 'assigned'].includes(job.status)) {
      return badRequest(reply, `Cannot dismiss job with status: ${job.status}`);
    }

    // Update job - unassign so it can be reassigned
    const updatedJob = await fastify.prisma.job.update({
      where: { id },
      data: {
        status: 'pending',
        assignedToUserId: null,
        dismissedAt: new Date(),
        dismissedReason: reason || 'No reason provided',
      },
      include: {
        property: { select: { name: true, address: true } },
      },
    });

    // Get tech name
    const techProfile = await fastify.prisma.technicianProfile.findUnique({
      where: { userId: user.sub },
      select: { name: true },
    });
    const techName = techProfile?.name || 'Technician';

    // Notify admins - they need to reassign
    try {
      await fastify.prisma.urgentNotification.create({
        data: {
          title: 'Job Dismissed',
          message: `${techName} dismissed job at ${job.property?.name || 'property'}. Reason: ${reason || 'Not specified'}. Needs reassignment.`,
          severity: 'warning',
          targetRole: 'admin',
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
      console.log(`[NOTIFICATION] Job ${id} dismissed by ${techName}`);
    } catch (notifError) {
      console.error('Failed to create admin notification:', notifError);
    }

    return { success: true, message: 'Job dismissed. Admins notified for reassignment.', job: updatedJob };
  });
};

export default jobsRoutes;
