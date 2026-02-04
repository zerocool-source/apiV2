import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { verifyPassword } from '../utils/password';
import { badRequest, unauthorized, notFound } from '../utils/errors';

const techLoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const techAuthRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/tech/login - Authenticate technician by email or phone
  fastify.post('/login', {
    schema: {
      tags: ['Tech Auth'],
      summary: 'Technician login',
      description: 'Authenticate a technician using email or phone number and password.',
      security: [],
      body: {
        type: 'object',
        required: ['identifier', 'password'],
        properties: {
          identifier: { type: 'string', description: 'Email or phone number' },
          password: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            technician: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' },
                role: { type: 'string' },
                region: { type: 'string' },
              },
            },
            token: { type: 'string' },
          },
        },
        400: { $ref: 'Error#' },
        401: { $ref: 'Error#' },
      },
    },
  }, async (request, reply) => {
    const result = techLoginSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { identifier, password } = result.data;

    // Find technician by email or phone
    const techProfile = await fastify.prisma.technicianProfile.findFirst({
      where: {
        OR: [
          { user: { email: identifier } },
          { phone: identifier },
        ],
      },
      include: {
        user: true,
      },
    });

    if (!techProfile) {
      return unauthorized(reply, 'Invalid credentials');
    }

    // Check password using user's passwordHash (techProfile.passwordHash available after db:push)
    const validPassword = await verifyPassword(password, techProfile.user.passwordHash);

    if (!validPassword) {
      return unauthorized(reply, 'Invalid credentials');
    }

    const token = fastify.jwt.sign({
      sub: techProfile.userId,
      role: techProfile.user.role,
    });

    return {
      technician: {
        id: techProfile.id,
        userId: techProfile.userId,
        name: techProfile.name,
        email: techProfile.user.email,
        phone: techProfile.phone,
        role: techProfile.user.role,
        region: techProfile.region,
      },
      token,
    };
  });

  // GET /api/tech/:id/profile - Get technician profile
  fastify.get('/:id/profile', {
    preHandler: [fastify.requireAuth],
    schema: {
      tags: ['Tech Auth'],
      summary: 'Get technician profile',
      description: 'Get the profile of a technician by their profile ID.',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            role: { type: 'string' },
            region: { type: 'string' },
            truckId: { type: 'string' },
            active: { type: 'boolean' },
          },
        },
        404: { $ref: 'Error#' },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const techProfile = await fastify.prisma.technicianProfile.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!techProfile) {
      return notFound(reply, 'Technician not found');
    }

    return {
      id: techProfile.id,
      userId: techProfile.userId,
      name: techProfile.name,
      email: techProfile.user.email,
      phone: techProfile.phone,
      role: techProfile.user.role,
      region: techProfile.region,
      truckId: techProfile.truckId,
      active: techProfile.active,
    };
  });

  // GET /api/tech/:id/jobs - Get jobs assigned to technician
  fastify.get('/:id/jobs', {
    preHandler: [fastify.requireAuth],
    schema: {
      tags: ['Tech Auth'],
      summary: 'Get technician jobs',
      description: 'Get all jobs assigned to a technician.',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
          limit: { type: 'integer', default: 50 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            jobs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  propertyId: { type: 'string' },
                  propertyName: { type: 'string' },
                  propertyAddress: { type: 'string' },
                  scheduledDate: { type: 'string' },
                  status: { type: 'string' },
                  priority: { type: 'string' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
        404: { $ref: 'Error#' },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { status?: string; limit?: number };

    // Find the technician profile to get userId
    const techProfile = await fastify.prisma.technicianProfile.findUnique({
      where: { id },
    });

    if (!techProfile) {
      return notFound(reply, 'Technician not found');
    }

    // Get assignments for this technician
    const where: any = {
      technicianId: techProfile.userId,
    };

    if (query.status) {
      where.status = query.status;
    }

    const assignments = await fastify.prisma.assignment.findMany({
      where,
      include: {
        property: true,
      },
      orderBy: { scheduledDate: 'asc' },
      take: query.limit || 50,
    });

    return {
      jobs: assignments.map(a => ({
        id: a.id,
        propertyId: a.propertyId,
        propertyName: a.property.name,
        propertyAddress: a.property.address,
        scheduledDate: a.scheduledDate.toISOString(),
        status: a.status,
        priority: a.priority,
        notes: a.notes,
      })),
    };
  });
};

export default techAuthRoutes;
