import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createItemSchema = z.object({
  truckId: z.string().min(1),
  sku: z.string().optional(),
  name: z.string().min(1),
  qty: z.number().int().min(0).default(0),
  unit: z.string().optional(),
});

const updateItemSchema = z.object({
  qty: z.number().int().min(0).optional(),
  name: z.string().min(1).optional(),
  sku: z.string().optional(),
  unit: z.string().optional(),
});

const truckInventoryRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/truck-inventory
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { truckId?: string };
    
    const where: any = {};
    if (query.truckId) {
      where.truckId = query.truckId;
    }

    const items = await fastify.prisma.truckInventoryItem.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return items;
  });

  // POST /api/truck-inventory
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = createItemSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const item = await fastify.prisma.truckInventoryItem.create({
      data: result.data,
    });

    return reply.status(201).send(item);
  });

  // PATCH /api/truck-inventory/:id
  fastify.patch('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = updateItemSchema.safeParse(request.body);
    
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const existing = await fastify.prisma.truckInventoryItem.findUnique({
      where: { id },
    });

    if (!existing) {
      return notFound(reply, 'Inventory item not found');
    }

    const item = await fastify.prisma.truckInventoryItem.update({
      where: { id },
      data: result.data,
    });

    return item;
  });
};

export default truckInventoryRoutes;
