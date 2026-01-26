import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const schemasPluginInternal: FastifyPluginAsync = async (fastify) => {
  fastify.addSchema({
    $id: 'Error',
    type: 'object',
    properties: {
      error: { type: 'string' },
      message: { type: 'string' },
      details: { type: 'object' },
    },
  });

  fastify.addSchema({
    $id: 'User',
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      email: { type: 'string', format: 'email' },
      role: { type: 'string', enum: ['tech', 'supervisor', 'repair', 'admin'] },
    },
  });

  fastify.addSchema({
    $id: 'TechnicianProfile',
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
  });

  fastify.addSchema({
    $id: 'Assignment',
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
  });

  fastify.addSchema({
    $id: 'Property',
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
  });
};

export default fp(schemasPluginInternal);
