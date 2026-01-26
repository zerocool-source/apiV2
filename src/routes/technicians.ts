import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound, forbidden } from '../utils/errors';
import { hashPassword } from '../utils/password';
import { parseLimit, parseUpdatedSince, buildPaginatedResponse } from '../utils/pagination';

const createTechnicianSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  truckId: z.string().optional(),
  supervisorId: z.string().uuid().nullable().optional(),
});

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
    schema: {
      tags: ['Technicians'],
      summary: 'List technicians with pagination',
      description: 'Get technicians based on role with cursor pagination. Tech sees self, supervisor sees team, admin/repair sees all.',
      querystring: {
        type: 'object',
        properties: {
          includeInactive: { type: 'string', enum: ['true', 'false'], description: 'Include inactive technicians' },
          updatedSince: { type: 'string', format: 'date-time', description: 'ISO timestamp to filter technicians updated after this time (applies to profile.updatedAt)' },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50, description: 'Number of items per page (default 50, max 200)' },
          cursor: { type: 'string', format: 'uuid', description: 'Cursor for pagination (user ID)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  email: { type: 'string' },
                  role: { type: 'string' },
                  technicianProfile: { $ref: 'TechnicianProfile#' },
                },
              },
            },
            nextCursor: { type: 'string', nullable: true, description: 'Cursor for next page, null if no more results' },
          },
        },
        401: { $ref: 'Error#' },
      },
    },
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const user = request.user;
    const query = request.query as { includeInactive?: string; updatedSince?: string; limit?: string; cursor?: string };
    const includeInactive = query.includeInactive === 'true';
    
    const limit = parseLimit(query.limit);
    const updatedSince = parseUpdatedSince(query.updatedSince);
    const cursor = query.cursor;

    // Tech role: return only their own profile (no pagination needed)
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
              updatedAt: true,
            },
          },
        },
      });

      if (!techUser) {
        return notFound(reply, 'User not found');
      }

      // Apply updatedSince filter for tech's own profile
      if (updatedSince && techUser.technicianProfile) {
        if (techUser.technicianProfile.updatedAt <= updatedSince) {
          return { items: [], nextCursor: null };
        }
      }

      return { items: [techUser], nextCursor: null };
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

      if (!includeInactive) {
        where.technicianProfile.active = true;
      }

      // Apply updatedSince to technicianProfile
      if (updatedSince) {
        where.technicianProfile.updatedAt = { gt: updatedSince };
      }
    } else if (user.role === 'repair' || user.role === 'admin') {
      where.technicianProfile = {};
      
      if (!includeInactive) {
        where.technicianProfile.active = true;
      }

      // Apply updatedSince to technicianProfile
      if (updatedSince) {
        where.technicianProfile.updatedAt = { gt: updatedSince };
      }
    } else {
      return forbidden(reply, 'Insufficient permissions');
    }

    // TODO: Ideal ordering would be by technicianProfile.updatedAt, but Prisma doesn't support
    // ordering by nested relation fields easily. Using User.updatedAt + id for stable pagination.
    const technicians = await fastify.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        updatedAt: true,
        technicianProfile: {
          select: {
            id: true,
            userId: true,
            name: true,
            phone: true,
            truckId: true,
            supervisorId: true,
            active: true,
            updatedAt: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    return buildPaginatedResponse(technicians, limit);
  });

  // POST /api/technicians
  // Admin-only: create a new technician user + profile
  fastify.post('/', {
    schema: {
      tags: ['Technicians'],
      summary: 'Create technician (Admin only)',
      description: 'Create a new technician user with profile. Requires admin or repair role.',
      body: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          name: { type: 'string' },
          phone: { type: 'string' },
          truckId: { type: 'string' },
          supervisorId: { type: 'string', format: 'uuid', nullable: true, description: 'Supervisor to assign (null for unassigned)' },
        },
        examples: [{
          email: 'new.tech@breakpoint.local',
          password: 'password123',
          name: 'John Tech',
          phone: '555-1234',
          truckId: 'TRUCK-01',
        }],
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string' },
            role: { type: 'string' },
            technicianProfile: { $ref: 'TechnicianProfile#' },
          },
        },
        400: { $ref: 'Error#' },
        403: { $ref: 'Error#' },
        409: { $ref: 'Error#' },
      },
    },
    preHandler: [fastify.requireRole(['admin', 'repair'])],
  }, async (request, reply) => {
    const result = createTechnicianSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { email, password, name, phone, truckId, supervisorId } = result.data;

    // Check if email already exists
    const existingUser = await fastify.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return reply.status(409).send({
        error: 'CONFLICT',
        message: 'A user with this email already exists',
      });
    }

    // If supervisorId is provided and not null, validate it exists and is a supervisor
    if (supervisorId !== undefined && supervisorId !== null) {
      const supervisor = await fastify.prisma.user.findUnique({
        where: { id: supervisorId },
      });

      if (!supervisor) {
        return badRequest(reply, 'Supervisor not found');
      }

      if (supervisor.role !== 'supervisor') {
        return badRequest(reply, 'The specified user is not a supervisor');
      }
    }

    // Hash the password
    const passwordHash = await hashPassword(password);

    // Create user and technician profile in a transaction
    const newUser = await fastify.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'tech',
        technicianProfile: {
          create: {
            name,
            phone: phone || null,
            truckId: truckId || null,
            supervisorId: supervisorId ?? null,
            active: true,
          },
        },
      },
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

    return reply.status(201).send(newUser);
  });

  // PATCH /api/technicians/:id
  // - supervisor: can update techs they own or claim unassigned techs
  // - repair (admin): can update any technician
  // - tech: can only update their own name/phone/truckId
  fastify.patch('/:id', {
    schema: {
      tags: ['Technicians'],
      summary: 'Update technician',
      description: 'Update technician profile. Tech can update own profile (name/phone/truckId). Supervisor can update their team. Admin can update any.',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Technician user ID' },
        },
      },
      body: {
        type: 'object',
        properties: {
          supervisorId: { type: 'string', format: 'uuid', nullable: true },
          active: { type: 'boolean' },
          name: { type: 'string' },
          phone: { type: 'string' },
          truckId: { type: 'string' },
        },
        examples: [{
          name: 'Updated Name',
          phone: '555-9999',
        }],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string' },
            role: { type: 'string' },
            technicianProfile: { $ref: 'TechnicianProfile#' },
          },
        },
        400: { $ref: 'Error#' },
        403: { $ref: 'Error#' },
        404: { $ref: 'Error#' },
      },
    },
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
