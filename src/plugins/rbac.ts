import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { forbidden } from '../utils/errors';

type Role = 'tech' | 'supervisor' | 'repair' | 'admin';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const rbacPlugin: FastifyPluginAsync = async (fastify) => {
  // Require authentication
  fastify.decorate('requireAuth', async function (request: FastifyRequest, reply: FastifyReply) {
    await fastify.authenticate(request, reply);
  });

  // Require specific roles
  fastify.decorate('requireRole', function (roles: Role[]) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      await fastify.authenticate(request, reply);
      
      const userRole = request.user?.role as Role;
      
      if (!userRole || !roles.includes(userRole)) {
        return forbidden(reply, `Access denied. Required roles: ${roles.join(', ')}`);
      }
    };
  });
};

export default fp(rbacPlugin, { 
  name: 'rbac',
  dependencies: ['jwt']
});
