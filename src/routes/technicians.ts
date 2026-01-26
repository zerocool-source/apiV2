import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound, forbidden } from '../utils/errors';

const patchTechnicianSchema = z.object({
  supervisorId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  truckId: z.string().optional(),
});

const techniciansRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/technicians
  // - supervisor: returns only their team (optionally include inactive)
  // - repair (admin equivalent): returns all technicians
  // - tech: returns only their own profile
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const user = request.user;
    const query = request.query as { includeInactive?: string };
    const includeInactive = query.includeInactive === 'true';

    // Tech role: return only their own profile
    if (user.role === 'tech') {
      const techUser = await fastify.prisma.user.findUnique({
        where: { id: user.sub },
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
              active: true,
            },
          },
        },
      });

      if (!techUser) {
        return notFound(reply, 'User not found');
      }

      return [techUser];
    }

    // Build where clause for supervisor/repair/admin
    const where: any = {
      role: { in: ['tech', 'repair'] },
    };

    // Supervisors can only see their own team members
    if (user.role === 'supervisor') {
      where.technicianProfile = {
        supervisorId: user.sub,
      };

      // Filter by active unless includeInactive is true
      if (!includeInactive) {
        where.technicianProfile.active = true;
      }
    } else if (user.role === 'repair' || user.role === 'admin') {
      // Repair (admin equivalent) and admin see all
      if (!includeInactive) {
        where.technicianProfile = {
          active: true,
        };
      }
    } else {
      return forbidden(reply, 'Insufficient permissions');
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
            active: true,
          },
        },
      },
      orderBy: { email: 'asc' },
    });

    return technicians;
  });

  // PATCH /api/technicians/:id
  // - supervisor: can update techs they own or claim unassigned techs
  // - repair (admin): can update any technician
  // - tech: can only update their own name/phone/truckId
  fastify.patch('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const result = patchTechnicianSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const updateData = result.data;

    // Find the technician
    const techUser = await fastify.prisma.user.findUnique({
      where: { id },
      include: { technicianProfile: true },
    });

    if (!techUser || !techUser.technicianProfile) {
      return notFound(reply, 'Technician not found');
    }

    const techProfile = techUser.technicianProfile;

    // RBAC rules based on role
    if (user.role === 'tech') {
      // Tech can only update themselves
      if (id !== user.sub) {
        return forbidden(reply, 'You can only update your own profile');
      }

      // Tech cannot update supervisorId or active
      if (updateData.supervisorId !== undefined || updateData.active !== undefined) {
        return forbidden(reply, 'Technicians cannot update supervisorId or active status');
      }

      // Update only allowed fields
      const updated = await fastify.prisma.technicianProfile.update({
        where: { id: techProfile.id },
        data: {
          name: updateData.name,
          phone: updateData.phone,
          truckId: updateData.truckId,
        },
      });

      return {
        id: techUser.id,
        email: techUser.email,
        role: techUser.role,
        technicianProfile: updated,
      };
    }

    if (user.role === 'supervisor') {
      // Supervisor can only update techs they own OR claim unassigned techs
      const isOwnTech = techProfile.supervisorId === user.sub;
      const isUnassigned = techProfile.supervisorId === null;

      if (!isOwnTech && !isUnassigned) {
        return forbidden(reply, 'You can only update technicians assigned to you or unassigned technicians');
      }

      // If unassigned, supervisor can only claim them (set supervisorId to themselves)
      if (isUnassigned) {
        if (updateData.supervisorId !== undefined && updateData.supervisorId !== user.sub) {
          return forbidden(reply, 'You can only assign unassigned technicians to yourself');
        }
      }

      // If own tech, cannot assign to someone else (only themselves or null)
      if (isOwnTech && updateData.supervisorId !== undefined) {
        if (updateData.supervisorId !== null && updateData.supervisorId !== user.sub) {
          return forbidden(reply, 'You cannot assign your technicians to another supervisor');
        }
      }

      // Update the profile
      const updated = await fastify.prisma.technicianProfile.update({
        where: { id: techProfile.id },
        data: {
          supervisorId: updateData.supervisorId,
          active: updateData.active,
          name: updateData.name,
          phone: updateData.phone,
          truckId: updateData.truckId,
        },
      });

      return {
        id: techUser.id,
        email: techUser.email,
        role: techUser.role,
        technicianProfile: updated,
      };
    }

    if (user.role === 'repair' || user.role === 'admin') {
      // Admin/repair can update any technician with any values
      const updated = await fastify.prisma.technicianProfile.update({
        where: { id: techProfile.id },
        data: {
          supervisorId: updateData.supervisorId,
          active: updateData.active,
          name: updateData.name,
          phone: updateData.phone,
          truckId: updateData.truckId,
        },
      });

      return {
        id: techUser.id,
        email: techUser.email,
        role: techUser.role,
        technicianProfile: updated,
      };
    }

    return forbidden(reply, 'Insufficient permissions');
  });

  // GET /api/technicians/locations
  fastify.get('/locations', {
    preHandler: [fastify.requireRole(['supervisor', 'repair', 'admin'])],
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
    preHandler: [fastify.requireRole(['supervisor', 'repair', 'admin'])],
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
