import { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Root route for Render's initial check
  fastify.get('/', {
    schema: {
      tags: ['Health'],
      summary: 'Root endpoint',
      security: [],
    },
  }, async () => {
    return { status: 'ok' };
  });


  fastify.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Health check',
      description: 'Check API health status. This is a public endpoint.',
      security: [],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }, async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
};

export default healthRoutes;
