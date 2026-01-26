import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, conflict } from '../utils/errors';

const createProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  price: z.number().min(0),
});

const productsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/products
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { category?: string; search?: string };
    
    const where: any = {};
    if (query.category) {
      where.category = query.category;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const products = await fastify.prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return products;
  });

  // POST /api/products
  fastify.post('/', {
    preHandler: [fastify.requireRole(['supervisor', 'admin'])],
  }, async (request, reply) => {
    const result = createProductSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { sku, name, category, price } = result.data;

    // Check if SKU already exists
    const existing = await fastify.prisma.product.findUnique({
      where: { sku },
    });
    if (existing) {
      return conflict(reply, 'Product with this SKU already exists');
    }

    const product = await fastify.prisma.product.create({
      data: { sku, name, category, price },
    });

    return reply.status(201).send(product);
  });
};

export default productsRoutes;
