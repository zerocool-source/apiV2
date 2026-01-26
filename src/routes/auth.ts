import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../utils/password';
import { badRequest, unauthorized, conflict } from '../utils/errors';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['tech', 'supervisor', 'repair', 'admin']).optional().default('tech'),
  name: z.string().optional(),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/auth/register
  fastify.post('/register', async (request, reply) => {
    const result = registerSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { email, password, role, name, phone } = result.data;

    // Check if user exists
    const existingUser = await fastify.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return conflict(reply, 'User with this email already exists');
    }

    const passwordHash = await hashPassword(password);

    const user = await fastify.prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        technicianProfile: name ? {
          create: {
            name,
            phone,
          },
        } : undefined,
      },
      include: {
        technicianProfile: true,
      },
    });

    const token = fastify.jwt.sign({
      sub: user.id,
      role: user.role,
    });

    return reply.status(201).send({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile: user.technicianProfile,
      },
      token,
    });
  });

  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { email, password } = result.data;

    const user = await fastify.prisma.user.findUnique({
      where: { email },
      include: {
        technicianProfile: true,
      },
    });

    if (!user) {
      return unauthorized(reply, 'Invalid email or password');
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return unauthorized(reply, 'Invalid email or password');
    }

    const token = fastify.jwt.sign({
      sub: user.id,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile: user.technicianProfile,
      },
      token,
    };
  });

  // POST /api/auth/logout
  fastify.post('/logout', async (request, reply) => {
    // Client-side logout - token invalidation would require a blacklist
    // For now, return success and let client discard token
    return { message: 'Logged out successfully' };
  });
};

export default authRoutes;
