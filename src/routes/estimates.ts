import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash } from 'crypto';
import { badRequest, notFound } from '../utils/errors';

const createEstimateSchema = z.object({
  jobId: z.string().uuid(),
  lines: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    total: z.number(),
  })),
  total: z.number(),
});

const generateEstimateSchema = z.object({
  jobText: z.string().min(1),
});

interface EstimateLine {
  type: 'part' | 'labor';
  sku: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

interface GeneratedEstimate {
  summary: string;
  lines: EstimateLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  assumptions: string[];
}

const TAX_RATE = 0.0825;
const LABOR_RATE_CENTS = 14500;

const estimatesRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/estimates/generate
  fastify.post('/generate', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = generateEstimateSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { jobText } = result.data;
    const jobTextLower = jobText.toLowerCase();
    
    const lines: EstimateLine[] = [];
    const assumptions: string[] = [];

    // Rule-based part detection
    if (jobTextLower.includes('igniter')) {
      const product = await fastify.prisma.product.findUnique({
        where: { sku: 'R0457502' },
      });
      
      if (product) {
        lines.push({
          type: 'part',
          sku: product.sku,
          description: product.name,
          quantity: 1,
          unitPriceCents: product.unitPriceCents,
          totalCents: product.unitPriceCents,
        });
        assumptions.push('Detected igniter issue - added Igniter Kit Jandy JXI');
      }
    }

    // Always add labor (2 hours)
    const laborHours = 2;
    const laborTotal = laborHours * LABOR_RATE_CENTS;
    lines.push({
      type: 'labor',
      sku: null,
      description: `Labor (${laborHours} hours @ $${(LABOR_RATE_CENTS / 100).toFixed(2)}/hr)`,
      quantity: laborHours,
      unitPriceCents: LABOR_RATE_CENTS,
      totalCents: laborTotal,
    });
    assumptions.push('Standard 2-hour labor estimate');

    // Calculate totals
    const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
    const taxCents = Math.round(subtotalCents * TAX_RATE);
    const totalCents = subtotalCents + taxCents;

    const estimate: GeneratedEstimate = {
      summary: `Estimate for: ${jobText.substring(0, 100)}${jobText.length > 100 ? '...' : ''}`,
      lines,
      subtotalCents,
      taxCents,
      totalCents,
      assumptions,
    };

    return estimate;
  });

  // POST /api/estimates/selection - Log tech's product selection for learning
  fastify.post('/selection', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const schema = z.object({
      jobText: z.string().min(1),
      category: z.string().optional(),
      productId: z.string().uuid(),
    });

    const result = schema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { jobText, category, productId } = result.data;
    const userId = request.user.sub;

    // Compute queryHash: sha256(jobText + '|' + (category||''))
    const hashInput = `${jobText}|${category || ''}`;
    const queryHash = createHash('sha256').update(hashInput).digest('hex');

    await fastify.prisma.techSelection.create({
      data: {
        userId,
        queryHash,
        category: category || null,
        productId,
      },
    });

    return { ok: true };
  });

  // GET /api/estimates
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { jobId?: string };
    
    const where: any = {};
    if (query.jobId) {
      where.jobId = query.jobId;
    }

    const estimates = await fastify.prisma.estimate.findMany({
      where,
      include: {
        job: {
          include: {
            property: true,
          },
        },
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

    return estimates;
  });

  // POST /api/estimates
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = createEstimateSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { jobId, lines, total } = result.data;
    const createdBy = request.user.sub;

    // Verify job exists
    const job = await fastify.prisma.job.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      return notFound(reply, 'Job not found');
    }

    const estimate = await fastify.prisma.estimate.create({
      data: {
        jobId,
        createdBy,
        lines,
        total,
      },
      include: {
        job: {
          include: {
            property: true,
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
    });

    return reply.status(201).send(estimate);
  });
};

export default estimatesRoutes;
