import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { badRequest, notFound } from '../utils/errors';
import { makeQueryHash } from '../utils/queryHash';

// Compute requestHash for audit/debug
function computeRequestHash(jobText: string): string {
  return createHash('sha256').update(jobText.trim().toLowerCase()).digest('hex');
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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
  laborRateCents: z.number().int().min(11500).max(16500).optional(),
});

interface EstimateLine {
  type: 'part' | 'labor';
  sku: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  matchConfidence?: 'high' | 'medium' | 'low';
}

interface GeneratedEstimate {
  summary: string;
  lines: EstimateLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  assumptions: string[];
}

// OpenAI extracted item schema with strict validation
const extractedItemSchema = z.object({
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().int().min(1).default(1),
    category: z.string().optional(),
    searchTerms: z.array(z.string().min(1)).min(1), // At least one search term required
  })),
  laborHours: z.number().min(0.5).max(40),
  summary: z.string().min(1),
  assumptions: z.array(z.string()).default([]),
});

const TAX_RATE = 0.0825;
const DEFAULT_LABOR_RATE_CENTS = 14500;

const estimatesRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/estimates/generate
  fastify.post('/generate', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const result = generateEstimateSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'Invalid request body', result.error.flatten());
    }

    const { jobText, laborRateCents = DEFAULT_LABOR_RATE_CENTS } = result.data;
    
    // Compute requestHash for audit
    const requestHash = computeRequestHash(jobText);
    const isProduction = process.env.NODE_ENV === 'production';
    
    const lines: EstimateLine[] = [];
    const assumptions: string[] = [];
    
    // Debug tracking
    let debugModel: string | null = null;
    let debugExtracted: any = null;
    const debugMatches: Array<{
      query: string;
      productId: string;
      sku: string;
      name: string;
      unitPriceCents: number;
      matchConfidence: 'high' | 'medium' | 'low';
      matchScore: number;
    }> = [];
    const debugUnmatched: Array<{ query: string; qty: number }> = [];
    const debugUnmatchedCandidates: Array<{
      query: string;
      qty: number;
      candidates: Array<{
        productId: string;
        sku: string;
        name: string;
        unitPriceCents: number;
        matchScore: number;
      }>;
    }> = [];

    // Use OpenAI to extract structured repair items from job text
    const systemPrompt = `You are a pool equipment repair estimator assistant. Given a job description, extract the parts/materials needed and estimate labor hours.

Return a JSON object with:
- items: array of {description, quantity, category, searchTerms[]}
  - description: what the item is (e.g., "pool pump motor", "igniter kit")
  - quantity: how many needed (default 1)
  - category: product category if known (e.g., "Heaters", "Pumps", "Filters", "Cleaners")
  - searchTerms: 2-4 keywords to search for this product (e.g., ["igniter", "kit", "jandy"])
- laborHours: estimated hours for the job (minimum 1, consider travel, diagnosis, repair complexity)
- summary: one-line summary of the repair
- assumptions: array of assumptions you made

Common pool equipment categories: Heaters, Pumps, Filters, Cleaners, Controls, Lights, Valves, Plumbing

Be specific with search terms - include brand names if mentioned. For heater issues, consider igniter kits, heat exchangers, gas valves, thermostats. For pump issues, consider motors, seals, impellers, baskets.`;

    try {
      const modelName = 'gpt-4o-mini';
      debugModel = modelName;
      
      const completion = await openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: jobText },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1000,
        temperature: 0.3,
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(responseText);
      debugExtracted = parsed;
      const extracted = extractedItemSchema.safeParse(parsed);

      if (!extracted.success) {
        fastify.log.warn({ parsed, error: extracted.error }, 'OpenAI response validation failed, using fallback');
        assumptions.push('AI extraction failed - using basic estimate');
      } else {
        const { items, laborHours, summary, assumptions: aiAssumptions } = extracted.data;
        
        // Add AI assumptions
        assumptions.push(...aiAssumptions);

        // Track matched product SKUs to avoid duplicates
        const matchedSkus = new Set<string>();

        // Scoring function for product matching
        const scoreProduct = (query: string, product: { name: string; sku: string }): number => {
          // Tokenize query: split on whitespace, lowercase, filter tokens < 2 chars
          const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
          const nameLower = product.name.toLowerCase();
          const skuLower = product.sku.toLowerCase();
          const queryLower = query.toLowerCase();
          
          let score = 0;
          
          // +6 if product.name contains the full query phrase as a substring
          if (nameLower.includes(queryLower)) {
            score += 6;
          }
          
          // +5 if all query tokens appear in product.name
          if (tokens.length > 0 && tokens.every(t => nameLower.includes(t))) {
            score += 5;
          }
          
          // +3 for each token that appears in product.sku
          for (const token of tokens) {
            if (skuLower.includes(token)) {
              score += 3;
            }
          }
          
          // +2 for each token that appears in product.name
          for (const token of tokens) {
            if (nameLower.includes(token)) {
              score += 2;
            }
          }
          
          return score;
        };

        // Search for each extracted item in the product catalog
        for (const item of items) {
          const query = item.description;
          
          // Build search conditions from description and search terms
          const allTerms = [query, ...item.searchTerms];
          const searchConditions = allTerms.flatMap(term => [
            { name: { contains: term, mode: 'insensitive' as const } },
            { sku: { contains: term, mode: 'insensitive' as const } },
          ]);
          
          // Also search by individual tokens from the query
          const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
          for (const token of queryTokens) {
            searchConditions.push({ name: { contains: token, mode: 'insensitive' as const } });
            searchConditions.push({ sku: { contains: token, mode: 'insensitive' as const } });
          }

          const searchResults = await fastify.prisma.product.findMany({
            where: {
              OR: searchConditions,
              ...(item.category ? { category: { equals: item.category, mode: 'insensitive' } } : {}),
            },
            take: 50,
            orderBy: { name: 'asc' },
          });

          // Filter out already-matched products and score remaining candidates
          const availableProducts = searchResults.filter(p => !matchedSkus.has(p.sku));
          
          let bestMatch: { product: any; score: number; confidence: 'high' | 'medium' | 'low' } | null = null;
          
          for (const product of availableProducts) {
            const score = scoreProduct(query, product);
            if (!bestMatch || score > bestMatch.score) {
              // Determine confidence based on score
              let confidence: 'high' | 'medium' | 'low';
              if (score >= 10) {
                confidence = 'high';
              } else if (score >= 6) {
                confidence = 'medium';
              } else {
                confidence = 'low';
              }
              bestMatch = { product, score, confidence };
            }
          }

          // Only add as priced line item if score > 5 (medium or high confidence)
          if (bestMatch && bestMatch.score > 5) {
            const { product, confidence } = bestMatch;
            matchedSkus.add(product.sku); // Track this SKU
            lines.push({
              type: 'part',
              sku: product.sku,
              description: product.name,
              quantity: item.quantity,
              unitPriceCents: product.unitPriceCents,
              totalCents: product.unitPriceCents * item.quantity,
              matchConfidence: confidence,
            });
            assumptions.push(`Matched "${item.description}" to ${product.name} (${confidence} confidence, score: ${bestMatch.score})`);
            
            // Track for debug
            debugMatches.push({
              query: item.description,
              productId: product.id,
              sku: product.sku,
              name: product.name,
              unitPriceCents: product.unitPriceCents,
              matchConfidence: confidence,
              matchScore: bestMatch.score,
            });
          } else {
            // Low score or no match - add to unmatched for manual review
            assumptions.push(`Could not find confident match for "${item.description}" - needs manual lookup${bestMatch ? ` (best score: ${bestMatch.score})` : ''}`);
            
            // Track for debug
            debugUnmatched.push({
              query: item.description,
              qty: item.quantity,
            });
            
            // Get top 5 candidates for unmatched items (for debug)
            const scoredCandidates = searchResults
              .map(p => ({ product: p, score: scoreProduct(item.description, p) }))
              .filter(c => c.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 5);
            
            debugUnmatchedCandidates.push({
              query: item.description,
              qty: item.quantity,
              candidates: scoredCandidates.map(c => ({
                productId: c.product.id,
                sku: c.product.sku,
                name: c.product.name,
                unitPriceCents: c.product.unitPriceCents,
                matchScore: c.score,
              })),
            });
          }
        }

        // Add labor line
        const laborTotal = Math.round(laborHours * laborRateCents);
        lines.push({
          type: 'labor',
          sku: null,
          description: `Labor (${laborHours} hours @ $${(laborRateCents / 100).toFixed(2)}/hr)`,
          quantity: laborHours,
          unitPriceCents: laborRateCents,
          totalCents: laborTotal,
        });
        assumptions.push(`AI estimated ${laborHours} labor hours`);

        // Calculate totals
        const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
        const taxCents = Math.round(subtotalCents * TAX_RATE);
        const totalCents = subtotalCents + taxCents;

        const response: any = {
          requestHash,
          summary: summary || `Estimate for: ${jobText.substring(0, 100)}${jobText.length > 100 ? '...' : ''}`,
          lines,
          subtotalCents,
          taxCents,
          totalCents,
          assumptions,
        };

        // Include debug payload only in non-production
        if (!isProduction) {
          response.debug = {
            model: debugModel,
            extracted: debugExtracted,
            matches: debugMatches,
            unmatched: debugUnmatched,
            unmatchedCandidates: debugUnmatchedCandidates,
          };
        }

        return response;
      }
    } catch (error) {
      fastify.log.error({ error }, 'OpenAI API error');
      assumptions.push('AI service unavailable - using fallback estimate');
    }

    // Fallback: basic labor-only estimate
    const laborHours = 2;
    const laborTotal = laborHours * laborRateCents;
    lines.push({
      type: 'labor',
      sku: null,
      description: `Labor (${laborHours} hours @ $${(laborRateCents / 100).toFixed(2)}/hr)`,
      quantity: laborHours,
      unitPriceCents: laborRateCents,
      totalCents: laborTotal,
    });
    assumptions.push('Fallback: Standard 2-hour labor estimate');

    const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
    const taxCents = Math.round(subtotalCents * TAX_RATE);
    const totalCents = subtotalCents + taxCents;

    const response: any = {
      requestHash,
      summary: `Estimate for: ${jobText.substring(0, 100)}${jobText.length > 100 ? '...' : ''}`,
      lines,
      subtotalCents,
      taxCents,
      totalCents,
      assumptions,
    };

    // Include debug payload only in non-production (fallback case)
    if (!isProduction) {
      response.debug = {
        model: debugModel,
        extracted: debugExtracted,
        matches: debugMatches,
        unmatched: debugUnmatched,
        unmatchedCandidates: debugUnmatchedCandidates,
      };
    }

    return response;
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

    // Verify product exists
    const product = await fastify.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      return notFound(reply, 'Product not found');
    }

    // Compute queryHash using standardized method
    const queryHash = makeQueryHash(jobText, category);

    await fastify.prisma.techSelection.create({
      data: {
        userId,
        queryHash,
        category: category || null,
        productId,
      },
    });

    return { ok: true, queryHash };
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
