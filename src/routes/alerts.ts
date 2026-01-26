import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../utils/errors';

const createAlertSchema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  audience: z.array(z.enum(['tech', 'supervisor', 'repair', 'admin'])),
  expiresAt: z.string().datetime().optional(),
});

const alertsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/alerts
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const userRole = request.user.role;

    // Get active alerts for user's role
    const alerts = await fastify.prisma.alert.findMany({
      where: {
        audience: { has: userRole },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
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

    return alerts;
  });

  // POST /api/alerts - Supervisor broadcast
  fastify.post('/', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async (request, reply) => {
    const result = createAlertSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { title, message, severity, audience, expiresAt } = result.data;
    const createdBy = request.user.sub;

    const alert = await fastify.prisma.alert.create({
      data: {
        createdBy,
        title,
        message,
        severity,
        audience,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
    });

    return reply.status(201).send(alert);
  });
};

export default alertsRoutes;
