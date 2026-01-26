import { FastifyPluginAsync } from 'fastify';

const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/metrics
  fastify.get('/', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async (request) => {
    const query = request.query as { date?: string };
    
    const today = query.date ? new Date(query.date) : new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    // Count assignments by status
    const [completed, inProgress, pending, cancelled] = await Promise.all([
      fastify.prisma.assignment.count({
        where: {
          status: 'completed',
          completedAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      fastify.prisma.assignment.count({
        where: { status: 'in_progress' },
      }),
      fastify.prisma.assignment.count({
        where: {
          status: 'pending',
          scheduledDate: { gte: startOfDay, lte: endOfDay },
        },
      }),
      fastify.prisma.assignment.count({
        where: { status: 'cancelled' },
      }),
    ]);

    // Count active alerts
    const alertsCount = await fastify.prisma.alert.count({
      where: {
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    // Count emergency reports today
    const emergenciesCount = await fastify.prisma.emergencyReport.count({
      where: {
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    // Count technicians clocked in
    const techniciansClockedIn = await fastify.prisma.technicianStatus.count({
      where: { clockedIn: true },
    });

    return {
      assignments: {
        completed,
        inProgress,
        pending,
        cancelled,
        total: completed + inProgress + pending + cancelled,
      },
      alerts: alertsCount,
      emergencies: emergenciesCount,
      techniciansClockedIn,
    };
  });
};

export default metricsRoutes;
