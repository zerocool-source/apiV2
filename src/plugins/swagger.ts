import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { readFileSync } from 'fs';
import { join } from 'path';
import { env } from '../utils/env';

function getPackageVersion(): string {
  try {
    const packagePath = join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return packageJson.version || '2.0.0';
  } catch {
    return '2.0.0';
  }
}

const swaggerPluginInternal: FastifyPluginAsync = async (fastify) => {
  const version = getPackageVersion();

  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Breakpoint API v2',
        description: 'Backend API for commercial pool operations mobile application. Supports field technicians, supervisors, repair techs, and admins with multi-supervisor isolation by region.',
        version,
        contact: {
          name: 'API Support',
        },
      },
      servers: [
        {
          url: env.BASE_URL || 'http://localhost:5000',
          description: env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
        },
      ],
      tags: [
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Technicians', description: 'Technician management and profiles' },
        { name: 'Assignments', description: 'Work assignment scheduling and lifecycle' },
        { name: 'Properties', description: 'Property/pool management' },
        { name: 'Jobs', description: 'Job and repair work management' },
        { name: 'Metrics', description: 'Operational metrics and analytics' },
        { name: 'Emergencies', description: 'Emergency reporting' },
        { name: 'Messages', description: 'Team messaging' },
        { name: 'Locations', description: 'GPS tracking and locations' },
        { name: 'Inspections', description: 'Pool inspections' },
        { name: 'Inventory', description: 'Truck inventory management' },
        { name: 'Uploads', description: 'File uploads' },
        { name: 'Sync', description: 'Offline sync capabilities' },
        { name: 'Health', description: 'Health check endpoints' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT Bearer token. Get token from POST /api/auth/login',
          },
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              error: { type: 'string', example: 'BAD_REQUEST' },
              message: { type: 'string', example: 'Invalid request body' },
              details: { type: 'object' },
            },
          },
          User: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              role: { type: 'string', enum: ['tech', 'supervisor', 'repair', 'admin'] },
            },
          },
          TechnicianProfile: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              userId: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              phone: { type: 'string', nullable: true },
              truckId: { type: 'string', nullable: true },
              supervisorId: { type: 'string', format: 'uuid', nullable: true },
              active: { type: 'boolean' },
            },
          },
          Assignment: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              propertyId: { type: 'string', format: 'uuid' },
              technicianId: { type: 'string', format: 'uuid' },
              scheduledDate: { type: 'string', format: 'date' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
              priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
              notes: { type: 'string', nullable: true },
              completedAt: { type: 'string', format: 'date-time', nullable: true },
              canceledAt: { type: 'string', format: 'date-time', nullable: true },
              canceledReason: { type: 'string', nullable: true },
            },
          },
          Property: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              address: { type: 'string' },
              latitude: { type: 'number', nullable: true },
              longitude: { type: 'number', nullable: true },
              region: { type: 'string', enum: ['north', 'mid', 'south'] },
              active: { type: 'boolean' },
            },
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });
};

export default fp(swaggerPluginInternal);
