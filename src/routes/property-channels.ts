import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createChannelSchema = z.object({
  propertyId: z.string().uuid(),
  channelId: z.string().min(1),
});

const propertyChannelsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/property-channels
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { propertyId?: string };
    
    const where: any = {};
    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }

    const channels = await fastify.prisma.propertyChannel.findMany({
      where,
      include: {
        property: true,
        creator: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return channels;
  });

  // POST /api/property-channels
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = createChannelSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { propertyId, channelId } = result.data;
    const userId = request.user.sub;

    // Verify property exists
    const property = await fastify.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      return notFound(reply, 'Property not found');
    }

    const channel = await fastify.prisma.propertyChannel.create({
      data: {
        propertyId,
        channelId,
        createdBy: userId,
      },
      include: {
        property: true,
        creator: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return reply.status(201).send(channel);
  });

  // DELETE /api/property-channels/:id
  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const channel = await fastify.prisma.propertyChannel.findUnique({
      where: { id },
    });

    if (!channel) {
      return notFound(reply, 'Property channel not found');
    }

    await fastify.prisma.propertyChannel.delete({
      where: { id },
    });

    return { message: 'Property channel deleted' };
  });
};

export default propertyChannelsRoutes;
