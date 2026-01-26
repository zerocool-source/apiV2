import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../utils/errors';

const createChemicalOrderSchema = z.object({
  propertyId: z.string().uuid().optional(),
  items: z.array(z.object({
    product: z.string(),
    quantity: z.number(),
    unit: z.string().optional(),
  })),
});

const chemicalOrdersRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/chemical-orders
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { propertyId?: string };
    
    const where: any = {};
    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }

    const chemicalOrders = await fastify.prisma.chemicalOrder.findMany({
      where,
      include: {
        property: true,
        creator: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return chemicalOrders;
  });

  // POST /api/chemical-orders
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = createChemicalOrderSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { propertyId, items } = result.data;
    const createdBy = request.user.sub;

    const chemicalOrder = await fastify.prisma.chemicalOrder.create({
      data: {
        propertyId,
        createdBy,
        items,
      },
      include: {
        property: true,
        creator: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
    });

    return reply.status(201).send(chemicalOrder);
  });
};

export default chemicalOrdersRoutes;
