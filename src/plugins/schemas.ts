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

  fastify.addSchema({
    $id: 'TechOpsEntry',
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      serviceRepairNumber: { type: 'string', nullable: true },
      entryType: { type: 'string', enum: ['repairs_needed', 'service_repairs', 'chemical_order', 'chemicals_dropoff', 'windy_day_cleanup', 'report_issue', 'supervisor_concerns', 'add_notes', 'chemical_issue', 'equipment_failure', 'safety_concern', 'general_note'] },
      technicianName: { type: 'string', nullable: true },
      technicianId: { type: 'string', format: 'uuid', nullable: true },
      positionType: { type: 'string', nullable: true },
      propertyId: { type: 'string', format: 'uuid', nullable: true },
      propertyName: { type: 'string', nullable: true },
      propertyAddress: { type: 'string', nullable: true },
      issueTitle: { type: 'string', nullable: true },
      description: { type: 'string', nullable: true },
      notes: { type: 'string', nullable: true },
      priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
      status: { type: 'string', enum: ['pending', 'in_progress', 'reviewed', 'resolved', 'completed', 'cancelled', 'archived', 'dismissed'] },
      isRead: { type: 'boolean' },
      chemicals: { type: 'string', nullable: true },
      quantity: { type: 'string', nullable: true },
      issueType: { type: 'string', nullable: true },
      photos: { type: 'array', items: { type: 'string' } },
      reviewedBy: { type: 'string', format: 'uuid', nullable: true },
      reviewedAt: { type: 'string', format: 'date-time', nullable: true },
      resolvedBy: { type: 'string', nullable: true },
      resolvedAt: { type: 'string', format: 'date-time', nullable: true },
      resolutionNotes: { type: 'string', nullable: true },
      vendorId: { type: 'string', nullable: true },
      vendorName: { type: 'string', nullable: true },
      orderStatus: { type: 'string', enum: ['pending', 'sent_to_vendor', 'confirmed', 'delivered'], nullable: true },
      invoiceSentAt: { type: 'string', format: 'date-time', nullable: true },
      invoiceSentToVendorId: { type: 'string', nullable: true },
      invoiceTemplateId: { type: 'string', nullable: true },
      partsCost: { type: 'integer', nullable: true },
      commissionPercent: { type: 'integer', nullable: true },
      commissionAmount: { type: 'integer', nullable: true },
      convertedToEstimateId: { type: 'string', nullable: true },
      convertedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      technician: { type: 'object', nullable: true },
      reviewer: { type: 'object', nullable: true },
      property: { type: 'object', nullable: true },
    },
  });
};

export default fp(schemasPluginInternal);
