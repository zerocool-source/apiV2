import { FastifyPluginAsync } from 'fastify';

const techniciansRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/technicians
  // Supervisors see only their team, admin sees all
  fastify.get('/', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async (request) => {
    const user = request.user;
    const where: any = {
      role: { in: ['tech', 'repair'] },
    };

    // Supervisors can only see their own team members
    if (user.role === 'supervisor') {
      where.technicianProfile = {
        supervisorId: user.sub,
      };
    }

    const technicians = await fastify.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        technicianProfile: {
          select: {
            id: true,
            userId: true,
            name: true,
            phone: true,
            truckId: true,
            supervisorId: true,
            region: true,
            active: true,
          },
        },
      },
      orderBy: { email: 'asc' },
    });

    return technicians;
  });

  // GET /api/technicians/locations
  fastify.get('/locations', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async (request) => {
    const user = request.user;
    const where: any = {
      role: { in: ['tech', 'repair'] },
    };

    // Supervisors can only see their own team's locations
    if (user.role === 'supervisor') {
      where.technicianProfile = {
        supervisorId: user.sub,
      };
    }

    // Get the latest location for each technician
    const technicians = await fastify.prisma.user.findMany({
      where,
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
  }, async (request) => {
    const user = request.user;
    const where: any = {
      role: { in: ['tech', 'repair'] },
    };

    // Supervisors can only see their own team's status
    if (user.role === 'supervisor') {
      where.technicianProfile = {
        supervisorId: user.sub,
      };
    }

    const technicians = await fastify.prisma.user.findMany({
      where,
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
