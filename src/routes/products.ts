import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, conflict } from '../utils/errors';
import { makeQueryHash } from '../utils/queryHash';
import { productSearchLimiter } from '../utils/rateLimiter';

const createProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  price: z.number().min(0),
});

const productsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/products/search
  fastify.get('/search', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const userId = request.user.sub;
    
    // Rate limiting by userId
    const searchLimit = productSearchLimiter.check(userId);
    if (!searchLimit.allowed) {
      reply.code(429);
      return { 
        error: 'rate_limited', 
        message: 'Too many search requests. Please wait before trying again.',
        retryAfterSeconds: searchLimit.retryAfterSeconds 
      };
    }

    const query = request.query as { q?: string; category?: string };
    
    // Compute queryHash for learning lookup using standardized method
    const queryHash = makeQueryHash(query.q || '', query.category);
    
    // Get user's past selections for this query
    const pastSelections = await fastify.prisma.techSelection.findMany({
      where: {
        userId,
        queryHash,
      },
      orderBy: { chosenAt: 'desc' },
      take: 10,
      select: { productId: true },
    });
    const boostedProductIds = pastSelections.map(s => s.productId);
    
    const where: any = { active: true };
    
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { sku: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    
    if (query.category) {
      where.category = query.category;
    }

    const products = await fastify.prisma.product.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        unitPriceCents: true,
        active: true,
      },
      orderBy: { name: 'asc' },
      take: 50,
    });

    // Re-order: boosted products first (in selection recency order), then rest
    if (boostedProductIds.length > 0) {
      const boostedSet = new Set(boostedProductIds);
      const boosted: typeof products = [];
      const rest: typeof products = [];
      
      // First, add products in boostedProductIds order
      for (const productId of boostedProductIds) {
        const product = products.find(p => p.id === productId);
        if (product && !boosted.some(b => b.id === productId)) {
          boosted.push(product);
        }
      }
      
      // Then add remaining products
      for (const product of products) {
        if (!boostedSet.has(product.id)) {
          rest.push(product);
        }
      }
      
      return [...boosted, ...rest];
    }

    return products;
  });

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
