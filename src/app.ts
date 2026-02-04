import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './utils/env';

// Plugins
import prismaPlugin from './plugins/prisma';
import jwtPlugin from './plugins/jwt';
import rbacPlugin from './plugins/rbac';
import schemasPlugin from './plugins/schemas';
import swaggerPlugin from './plugins/swagger';

// Routes
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import propertiesRoutes from './routes/properties';
import assignmentsRoutes from './routes/assignments';
import propertyChannelsRoutes from './routes/property-channels';
import routeStopsRoutes from './routes/route-stops';
import techniciansRoutes from './routes/technicians';
import rosterRoutes from './routes/roster';
import emergenciesRoutes from './routes/emergencies';
import locationsRoutes from './routes/locations';
import messagesRoutes from './routes/messages';
import truckInventoryRoutes from './routes/truck-inventory';
import inspectionsRoutes from './routes/inspections';
import metricsRoutes from './routes/metrics';
import alertsRoutes from './routes/alerts';
import repairsRoutes from './routes/repairs';
import jobsRoutes from './routes/jobs';
import estimatesRoutes from './routes/estimates';
import productsRoutes from './routes/products';
import timeEntriesRoutes from './routes/time-entries';
import syncRoutes from './routes/sync';
import uploadsRoutes from './routes/uploads';
import serviceRepairsRoutes from './routes/service-repairs';
import chemicalOrdersRoutes from './routes/chemical-orders';
import techOpsRoutes from './routes/tech-ops';
import usersRoutes from './routes/users';
import techAuthRoutes from './routes/tech-auth';
import repairRequestsRoutes from './routes/repair-requests';

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    ajv: {
      customOptions: {
        strict: false,
      },
    },
  });

  // CORS
  await fastify.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  });

  // Multipart for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  // Plugins
  await fastify.register(prismaPlugin);
  await fastify.register(jwtPlugin);
  await fastify.register(rbacPlugin);
  await fastify.register(schemasPlugin);
  await fastify.register(swaggerPlugin);

  // Routes
  await fastify.register(healthRoutes, { prefix: '/api' });
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(propertiesRoutes, { prefix: '/api/properties' });
  await fastify.register(assignmentsRoutes, { prefix: '/api/assignments' });
  await fastify.register(propertyChannelsRoutes, { prefix: '/api/property-channels' });
  await fastify.register(routeStopsRoutes, { prefix: '/api/route-stops' });
  await fastify.register(techniciansRoutes, { prefix: '/api/technicians' });
  await fastify.register(rosterRoutes, { prefix: '/api/roster' });
  await fastify.register(emergenciesRoutes, { prefix: '/api/emergencies' });
  await fastify.register(locationsRoutes, { prefix: '/api/locations' });
  await fastify.register(messagesRoutes, { prefix: '/api/messages' });
  await fastify.register(truckInventoryRoutes, { prefix: '/api/truck-inventory' });
  await fastify.register(inspectionsRoutes, { prefix: '/api/inspections' });
  await fastify.register(metricsRoutes, { prefix: '/api/metrics' });
  await fastify.register(alertsRoutes, { prefix: '/api/alerts' });
  await fastify.register(repairsRoutes, { prefix: '/api/repairs' });
  await fastify.register(jobsRoutes, { prefix: '/api/jobs' });
  await fastify.register(estimatesRoutes, { prefix: '/api/estimates' });
  await fastify.register(productsRoutes, { prefix: '/api/products' });
  await fastify.register(timeEntriesRoutes, { prefix: '/api/time-entries' });
  await fastify.register(syncRoutes, { prefix: '/api/sync' });
  await fastify.register(uploadsRoutes, { prefix: '/api/uploads' });
  await fastify.register(serviceRepairsRoutes, { prefix: '/api/service-repairs' });
  await fastify.register(chemicalOrdersRoutes, { prefix: '/api/chemical-orders' });
  await fastify.register(techOpsRoutes, { prefix: '/api/tech-ops' });
  await fastify.register(usersRoutes, { prefix: '/api/users' });
  await fastify.register(techAuthRoutes, { prefix: '/api/tech' });
  await fastify.register(repairRequestsRoutes, { prefix: '/api/repair-requests' });

  // Global error handler
  fastify.setErrorHandler((error: Error & { validation?: unknown; statusCode?: number }, request, reply) => {
    fastify.log.error({ err: error, url: request.url, method: request.method }, 'Request error');
    
    if (error.validation) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
      });
    }

    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      error: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      message: error.message || 'Internal server error',
    });
  });

  return fastify;
}
