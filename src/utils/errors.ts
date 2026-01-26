import { FastifyReply } from 'fastify';

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  error: string,
  message: string,
  details?: unknown
): FastifyReply {
  const response: ApiError = { error, message };
  if (details !== undefined) {
    response.details = details;
  }
  return reply.status(statusCode).send(response);
}

export function badRequest(reply: FastifyReply, message: string, details?: unknown): FastifyReply {
  return sendError(reply, 400, 'BAD_REQUEST', message, details);
}

export function unauthorized(reply: FastifyReply, message = 'Unauthorized'): FastifyReply {
  return sendError(reply, 401, 'UNAUTHORIZED', message);
}

export function forbidden(reply: FastifyReply, message = 'Forbidden'): FastifyReply {
  return sendError(reply, 403, 'FORBIDDEN', message);
}

export function notFound(reply: FastifyReply, message = 'Not found'): FastifyReply {
  return sendError(reply, 404, 'NOT_FOUND', message);
}

export function conflict(reply: FastifyReply, message: string): FastifyReply {
  return sendError(reply, 409, 'CONFLICT', message);
}

export function internalError(reply: FastifyReply, message = 'Internal server error'): FastifyReply {
  return sendError(reply, 500, 'INTERNAL_ERROR', message);
}
