import { FastifyPluginAsync } from 'fastify';

const techniciansRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/technicians
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async () => {
    const technicians = await fastify.prisma.user.findMany({
      where: {
        role: { in: ['tech', 'repair'] },
      },
      select: {
        id: true,
        email: true,
        role: true,
        technicianProfile: true,
      },
      orderBy: { email: 'asc' },
    });

    return technicians;
  });

  // GET /api/technicians/locations
  fastify.get('/locations', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async () => {
    // Get the latest location for each technician
    const technicians = await fastify.prisma.user.findMany({
      where: {
        role: { in: ['tech', 'repair'] },
      },
      select: {
        id: true,
        email: true,
        technicianProfile: true,
        locationPings: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });

    return technicians.map(tech => ({
      id: tech.id,
      email: tech.email,
      profile: tech.technicianProfile,
      lastLocation: tech.locationPings[0] || null,
    }));
  });

  // GET /api/technicians/status
  fastify.get('/status', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async () => {
    const technicians = await fastify.prisma.user.findMany({
      where: {
        role: { in: ['tech', 'repair'] },
      },
      select: {
        id: true,
        email: true,
        technicianProfile: true,
        technicianStatus: {
          include: {
            currentProperty: true,
            currentAssignment: true,
          },
        },
      },
    });

    return technicians.map(tech => ({
      id: tech.id,
      email: tech.email,
      profile: tech.technicianProfile,
      status: tech.technicianStatus || {
        clockedIn: false,
        currentPropertyId: null,
        currentAssignmentId: null,
      },
    }));
  });
};

export default techniciansRoutes;
