import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound, forbidden } from '../utils/errors';
import { hashPassword } from '../utils/password';

const roles = ['tech', 'supervisor', 'repair', 'admin'] as const;
const regions = ['north', 'mid', 'south'] as const;

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
  role: z.enum(roles).default('tech'),
  region: z.enum(regions).optional(),
  truckId: z.string().optional(),
  supervisorId: z.string().uuid().optional(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  role: z.enum(roles).optional(),
  region: z.enum(regions).nullable().optional(),
  truckId: z.string().optional(),
  supervisorId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
});

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/users - List all users (admin only)
  fastify.get('/', {
    schema: {
      tags: ['Users'],
      summary: 'List all users',
      description: 'Get all users with optional role filter. Admin only.',
      querystring: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['tech', 'technician', 'supervisor', 'repair', 'admin'], description: 'Filter by role' },
          active: { type: 'string', enum: ['true', 'false'], description: 'Filter by active status' },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          cursor: { type: 'string', format: 'uuid', description: 'Cursor for pagination' },
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
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                  technicianProfile: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      phone: { type: 'string', nullable: true },
                      truckId: { type: 'string', nullable: true },
                      active: { type: 'boolean' },
                      region: { type: 'string', nullable: true },
                      supervisorId: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
            nextCursor: { type: 'string', nullable: true },
          },
        },
        401: { $ref: 'Error#' },
        403: { $ref: 'Error#' },
      },
    },
    preHandler: [fastify.requireAuth, fastify.requireRole(['admin'])],
  }, async (request, reply) => {
    const query = request.query as { role?: string; active?: string; limit?: string; cursor?: string };
    
    const limit = Math.min(parseInt(query.limit || '50', 10) || 50, 200);
    const cursor = query.cursor;
    
    let roleFilter: string | undefined = query.role;
    if (roleFilter === 'technician') roleFilter = 'tech';
    
    const where: any = {};
    if (roleFilter) {
      where.role = roleFilter;
    }
    
    if (query.active !== undefined) {
      if (query.active === 'true') {
        where.technicianProfile = { active: true };
      } else if (query.active === 'false') {
        where.technicianProfile = { active: false };
      }
    }
    
    if (cursor) {
      where.id = { gt: cursor };
    }

    const users = await fastify.prisma.user.findMany({
      where,
      take: limit + 1,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        technicianProfile: {
          select: {
            id: true,
            name: true,
            phone: true,
            truckId: true,
            active: true,
            region: true,
            supervisorId: true,
          },
        },
      },
    });

    const hasMore = users.length > limit;
    const items = hasMore ? users.slice(0, limit) : users;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { items, nextCursor };
  });

  // POST /api/users - Create a new user (admin only)
  fastify.post('/', {
    schema: {
      tags: ['Users'],
      summary: 'Create a new user',
      description: 'Create a new user account. If role is technician, also creates TechnicianProfile. Admin only.',
      body: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          role: { type: 'string', enum: ['tech', 'technician', 'supervisor', 'repair', 'admin'], default: 'tech' },
          region: { type: 'string', enum: ['north', 'mid', 'south'] },
          truckId: { type: 'string' },
          supervisorId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string' },
            role: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            technicianProfile: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                phone: { type: 'string', nullable: true },
                truckId: { type: 'string', nullable: true },
                active: { type: 'boolean' },
                region: { type: 'string', nullable: true },
                supervisorId: { type: 'string', nullable: true },
              },
            },
          },
        },
        400: { $ref: 'Error#' },
        401: { $ref: 'Error#' },
        403: { $ref: 'Error#' },
      },
    },
    preHandler: [fastify.requireAuth, fastify.requireRole(['admin'])],
  }, async (request, reply) => {
    const body = request.body as any;
    
    let role = body.role || 'tech';
    if (role === 'technician') role = 'tech';
    
    const parsed = createUserSchema.safeParse({ ...body, role });
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0].message,
      });
    }

    const data = parsed.data;

    const existingUser = await fastify.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return reply.status(400).send({
        error: 'EMAIL_EXISTS',
        message: 'A user with this email already exists',
      });
    }

    const passwordHash = await hashPassword(data.password);
    const fullName = `${data.firstName} ${data.lastName}`;

    const user = await fastify.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: data.role,
        technicianProfile: (data.role === 'tech' || data.role === 'supervisor') ? {
          create: {
            name: fullName,
            phone: data.phone,
            truckId: data.truckId,
            region: data.region,
            supervisorId: data.supervisorId,
            active: true,
          },
        } : undefined,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        technicianProfile: {
          select: {
            id: true,
            name: true,
            phone: true,
            truckId: true,
            active: true,
            region: true,
            supervisorId: true,
          },
        },
      },
    });

    return reply.status(201).send(user);
  });

  // GET /api/users/:id - Get single user (admin only)
  fastify.get<{ Params: { id: string } }>('/:id', {
    schema: {
      tags: ['Users'],
      summary: 'Get user by ID',
      description: 'Get a single user by ID. Admin only.',
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
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string' },
            role: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            technicianProfile: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                phone: { type: 'string', nullable: true },
                truckId: { type: 'string', nullable: true },
                active: { type: 'boolean' },
                region: { type: 'string', nullable: true },
                supervisorId: { type: 'string', nullable: true },
              },
            },
          },
        },
        401: { $ref: 'Error#' },
        403: { $ref: 'Error#' },
        404: { $ref: 'Error#' },
      },
    },
    preHandler: [fastify.requireAuth, fastify.requireRole(['admin'])],
  }, async (request, reply) => {
    const { id } = request.params;

    const user = await fastify.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        technicianProfile: {
          select: {
            id: true,
            name: true,
            phone: true,
            truckId: true,
            active: true,
            region: true,
            supervisorId: true,
          },
        },
      },
    });

    if (!user) {
      return reply.status(404).send({
        error: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return user;
  });

  // PUT /api/users/:id - Update user (admin only)
  fastify.put<{ Params: { id: string } }>('/:id', {
    schema: {
      tags: ['Users'],
      summary: 'Update user',
      description: 'Update a user by ID. Can update password, profile info. Admin only.',
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
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          role: { type: 'string', enum: ['tech', 'technician', 'supervisor', 'repair', 'admin'] },
          region: { type: 'string', enum: ['north', 'mid', 'south'], nullable: true },
          truckId: { type: 'string' },
          supervisorId: { type: 'string', format: 'uuid', nullable: true },
          active: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string' },
            role: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            technicianProfile: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                phone: { type: 'string', nullable: true },
                truckId: { type: 'string', nullable: true },
                active: { type: 'boolean' },
                region: { type: 'string', nullable: true },
                supervisorId: { type: 'string', nullable: true },
              },
            },
          },
        },
        400: { $ref: 'Error#' },
        401: { $ref: 'Error#' },
        403: { $ref: 'Error#' },
        404: { $ref: 'Error#' },
      },
    },
    preHandler: [fastify.requireAuth, fastify.requireRole(['admin'])],
  }, async (request, reply) => {
    const { id } = request.params;
    const body = request.body as any;

    let role = body.role;
    if (role === 'technician') role = 'tech';

    const parsed = updateUserSchema.safeParse({ ...body, role });
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0].message,
      });
    }

    const data = parsed.data;

    const existingUser = await fastify.prisma.user.findUnique({
      where: { id },
      include: { technicianProfile: true },
    });

    if (!existingUser) {
      return reply.status(404).send({
        error: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    if (data.email && data.email !== existingUser.email) {
      const emailExists = await fastify.prisma.user.findUnique({
        where: { email: data.email },
      });
      if (emailExists) {
        return reply.status(400).send({
          error: 'EMAIL_EXISTS',
          message: 'A user with this email already exists',
        });
      }
    }

    const userUpdate: any = {};
    if (data.email) userUpdate.email = data.email;
    if (data.password) userUpdate.passwordHash = await hashPassword(data.password);
    if (data.role) userUpdate.role = data.role;

    const profileUpdate: any = {};
    if (data.firstName || data.lastName) {
      const firstName = data.firstName || existingUser.technicianProfile?.name?.split(' ')[0] || '';
      const lastName = data.lastName || existingUser.technicianProfile?.name?.split(' ').slice(1).join(' ') || '';
      profileUpdate.name = `${firstName} ${lastName}`.trim();
    }
    if (data.phone !== undefined) profileUpdate.phone = data.phone;
    if (data.truckId !== undefined) profileUpdate.truckId = data.truckId;
    if (data.region !== undefined) profileUpdate.region = data.region;
    if (data.supervisorId !== undefined) profileUpdate.supervisorId = data.supervisorId;
    if (data.active !== undefined) profileUpdate.active = data.active;

    const user = await fastify.prisma.user.update({
      where: { id },
      data: {
        ...userUpdate,
        technicianProfile: existingUser.technicianProfile && Object.keys(profileUpdate).length > 0
          ? { update: profileUpdate }
          : undefined,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        technicianProfile: {
          select: {
            id: true,
            name: true,
            phone: true,
            truckId: true,
            active: true,
            region: true,
            supervisorId: true,
          },
        },
      },
    });

    return user;
  });

  // DELETE /api/users/:id - Soft delete (deactivate) user (admin only)
  fastify.delete<{ Params: { id: string } }>('/:id', {
    schema: {
      tags: ['Users'],
      summary: 'Deactivate user',
      description: 'Soft delete a user by setting their profile to inactive. Admin only.',
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
            message: { type: 'string' },
            id: { type: 'string', format: 'uuid' },
          },
        },
        401: { $ref: 'Error#' },
        403: { $ref: 'Error#' },
        404: { $ref: 'Error#' },
      },
    },
    preHandler: [fastify.requireAuth, fastify.requireRole(['admin'])],
  }, async (request, reply) => {
    const { id } = request.params;

    const user = await fastify.prisma.user.findUnique({
      where: { id },
      include: { technicianProfile: true },
    });

    if (!user) {
      return reply.status(404).send({
        error: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    if (user.technicianProfile) {
      await fastify.prisma.technicianProfile.update({
        where: { userId: id },
        data: { active: false },
      });
    }

    return {
      message: 'User deactivated successfully',
      id,
    };
  });
};

export default usersRoutes;
