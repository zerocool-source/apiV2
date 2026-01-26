import { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { badRequest } from '../utils/errors';

const UPLOAD_DIR = './uploads';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const uploadsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/uploads - Accept multipart file upload
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const data = await request.file();
    
    if (!data) {
      return badRequest(reply, 'No file uploaded');
    }

    const userId = request.user.sub;
    const fileId = randomUUID();
    const ext = path.extname(data.filename) || '';
    const filename = `${fileId}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Save file to disk
    await pipeline(data.file, fs.createWriteStream(filepath));

    // Create upload record
    const upload = await fastify.prisma.upload.create({
      data: {
        createdBy: userId,
        url: `/uploads/${filename}`,
        mime: data.mimetype,
      },
    });

    return reply.status(201).send({
      id: upload.id,
      url: upload.url,
      mime: upload.mime,
      createdAt: upload.createdAt,
    });
  });

  // GET /api/uploads
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request) => {
    const query = request.query as { propertyId?: string };
    const user = request.user;

    const where: any = {};
    
    // Regular users can only see their own uploads
    if (user.role === 'tech' || user.role === 'repair') {
      where.createdBy = user.sub;
    }

    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }

    const uploads = await fastify.prisma.upload.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return uploads;
  });
};

export default uploadsRoutes;
