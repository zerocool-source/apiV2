import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createMessageSchema = z.object({
  channelId: z.string().uuid().optional(),
  toUserId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  text: z.string().min(1),
});

const messagesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/messages - with cursor pagination
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const query = request.query as { 
      channelId?: string; 
      toUserId?: string;
      cursor?: string;
      limit?: string;
    };
    const userId = request.user.sub;

    if (!query.channelId && !query.toUserId) {
      return badRequest(reply, 'Either channelId or toUserId is required');
    }

    const limit = parseInt(query.limit || '50');
    const where: any = {};

    if (query.channelId) {
      where.channelId = query.channelId;
    } else if (query.toUserId) {
      // Direct messages between current user and target user
      where.OR = [
        { fromUserId: userId, toUserId: query.toUserId },
        { fromUserId: query.toUserId, toUserId: userId },
      ];
    }

    if (query.cursor) {
      where.id = { lt: query.cursor };
    }

    const messages = await fastify.prisma.message.findMany({
      where,
      include: {
        fromUser: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
        toUser: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, -1) : messages;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  });

  // POST /api/messages
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = createMessageSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { channelId, toUserId, propertyId, text } = result.data;
    const fromUserId = request.user.sub;

    // Validate channel exists if provided
    if (channelId) {
      const channel = await fastify.prisma.propertyChannel.findUnique({
        where: { id: channelId },
      });
      if (!channel) {
        return notFound(reply, 'Channel not found');
      }
    }

    // Validate recipient exists if provided
    if (toUserId) {
      const recipient = await fastify.prisma.user.findUnique({
        where: { id: toUserId },
      });
      if (!recipient) {
        return notFound(reply, 'Recipient not found');
      }
    }

    const message = await fastify.prisma.message.create({
      data: {
        channelId,
        fromUserId,
        toUserId,
        propertyId,
        text,
      },
      include: {
        fromUser: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
        toUser: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
    });

    return reply.status(201).send(message);
  });
};

export default messagesRoutes;
