import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors';

const createRepairRequestSchema = z.object({
  propertyId: z.string().uuid(),
  description: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
});

const createServiceRepairSchema = z.object({
  propertyId: z.string().uuid(),
  details: z.record(z.unknown()),
});

const createChemicalOrderSchema = z.object({
  propertyId: z.string().uuid().optional(),
  items: z.array(z.object({
    product: z.string(),
    quantity: z.number(),
    unit: z.string().optional(),
  })),
});

const repairsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/repairs
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = createRepairRequestSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { propertyId, description, priority } = result.data;
    const createdBy = request.user.sub;

    // Verify property exists
    const property = await fastify.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      return notFound(reply, 'Property not found');
    }

    const repairRequest = await fastify.prisma.repairRequest.create({
      data: {
        propertyId,
        createdBy,
        description,
        priority,
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

    return reply.status(201).send(repairRequest);
  });

  // GET /api/repairs
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { propertyId?: string; priority?: string };
    
    const where: any = {};
    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }
    if (query.priority) {
      where.priority = query.priority;
    }

    const repairs = await fastify.prisma.repairRequest.findMany({
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

    return repairs;
  });
};

export default repairsRoutes;

// Service Repairs route (in same module)
export const serviceRepairsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/service-repairs', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = createServiceRepairSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { propertyId, details } = result.data;
    const createdBy = request.user.sub;

    const serviceRepair = await fastify.prisma.serviceRepair.create({
      data: {
        propertyId,
        createdBy,
        details,
      },
    });

    return reply.status(201).send(serviceRepair);
  });
};

// Chemical Orders route
export const chemicalOrdersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/chemical-orders', {
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
    });

    return reply.status(201).send(chemicalOrder);
  });
};
