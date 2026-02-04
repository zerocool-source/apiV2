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
          url: `http://${env.HOST}:${env.PORT}`,
          description: env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
        },
      ],
      tags: [
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Technicians', description: 'Technician management and profiles' },
        { name: 'Assignments', description: 'Work assignment scheduling and lifecycle' },
        { name: 'Properties', description: 'Property/pool management' },
        { name: 'Jobs', description: 'Job and repair work management' },
        { name: 'Estimates', description: 'AI-powered estimate generation and management' },
        { name: 'Products', description: 'Product catalog and search' },
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
    theme: {
      title: 'Breakpoint API v2',
      css: [
        {
          filename: 'theme.css',
          content: `
            /* Blue, Orange, White Theme */
            body { background: #ffffff !important; }
            .swagger-ui { background: #ffffff; }
            
            /* Top bar - Blue */
            .swagger-ui .topbar { background-color: #1e3a5f !important; }
            .swagger-ui .topbar .download-url-wrapper .select-label select { border-color: #f7931e; }
            .swagger-ui .topbar a { color: #ffffff; }
            .swagger-ui .topbar .download-url-wrapper input[type=text] { border-color: #f7931e; }
            .swagger-ui .topbar .download-url-wrapper .download-url-button { background: #f7931e; color: #1e3a5f; }
            
            /* Info section */
            .swagger-ui .info .title { color: #1e3a5f !important; }
            .swagger-ui .info a { color: #f7931e !important; }
            .swagger-ui .info .base-url { color: #1e3a5f; }
            
            /* Operation tags - Blue headers */
            .swagger-ui .opblock-tag { color: #1e3a5f !important; border-bottom: 1px solid #e8e8e8; }
            .swagger-ui .opblock-tag:hover { background: rgba(30, 58, 95, 0.05); }
            .swagger-ui .opblock-tag svg { fill: #1e3a5f !important; }
            
            /* HTTP Methods */
            .swagger-ui .opblock.opblock-get { background: rgba(30, 58, 95, 0.1); border-color: #1e3a5f; }
            .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #1e3a5f; }
            .swagger-ui .opblock.opblock-get .opblock-summary { border-color: #1e3a5f; }
            
            .swagger-ui .opblock.opblock-post { background: rgba(247, 147, 30, 0.1); border-color: #f7931e; }
            .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #f7931e; }
            .swagger-ui .opblock.opblock-post .opblock-summary { border-color: #f7931e; }
            
            .swagger-ui .opblock.opblock-put { background: rgba(30, 58, 95, 0.1); border-color: #2d5986; }
            .swagger-ui .opblock.opblock-put .opblock-summary-method { background: #2d5986; }
            .swagger-ui .opblock.opblock-put .opblock-summary { border-color: #2d5986; }
            
            .swagger-ui .opblock.opblock-patch { background: rgba(80, 140, 200, 0.1); border-color: #508cc8; }
            .swagger-ui .opblock.opblock-patch .opblock-summary-method { background: #508cc8; }
            .swagger-ui .opblock.opblock-patch .opblock-summary { border-color: #508cc8; }
            
            .swagger-ui .opblock.opblock-delete { background: rgba(200, 80, 60, 0.1); border-color: #c8503c; }
            .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #c8503c; }
            .swagger-ui .opblock.opblock-delete .opblock-summary { border-color: #c8503c; }
            
            /* Buttons */
            .swagger-ui .btn.authorize { background-color: #f7931e !important; border-color: #f7931e !important; color: #fff !important; }
            .swagger-ui .btn.authorize svg { fill: #fff !important; }
            .swagger-ui .btn.execute { background-color: #1e3a5f !important; border-color: #1e3a5f !important; }
            .swagger-ui .btn.cancel { background-color: #c8503c !important; border-color: #c8503c !important; }
            
            /* Try it out button */
            .swagger-ui .try-out__btn { border-color: #1e3a5f !important; color: #1e3a5f !important; }
            .swagger-ui .try-out__btn:hover { background-color: #1e3a5f !important; color: #fff !important; }
            
            /* Models section */
            .swagger-ui section.models { border-color: #1e3a5f; }
            .swagger-ui section.models h4 { color: #1e3a5f; }
            .swagger-ui .model-title { color: #1e3a5f !important; }
            
            /* Links */
            .swagger-ui a { color: #1e3a5f; }
            .swagger-ui a:hover { color: #f7931e; }
            
            /* Scheme container */
            .swagger-ui .scheme-container { background: #f8f9fa; border-bottom: 1px solid #e8e8e8; }
            
            /* Response codes */
            .swagger-ui .responses-inner h4, .swagger-ui .responses-inner h5 { color: #1e3a5f; }
            .swagger-ui table thead tr th { color: #1e3a5f; }
            
            /* Version badge */
            .swagger-ui .info .title small.version-stamp { background-color: #f7931e !important; }
            
            /* Server dropdown */
            .swagger-ui .servers-title { color: #1e3a5f; }
            .swagger-ui .servers select { border-color: #1e3a5f; }
          `
        }
      ]
    }
  });
};

export default fp(swaggerPluginInternal);
