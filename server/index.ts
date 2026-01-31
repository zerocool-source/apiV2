// Pool Operations API v2 - Fastify Server with Vite Frontend
import Fastify from 'fastify';
import middie from '@fastify/middie';
import cors from '@fastify/cors';
import { createServer as createViteServer, ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
};

async function start() {
  const { buildApp } = await import('../src/app');
  const app = await buildApp();

  let vite: ViteDevServer | null = null;

  if (env.NODE_ENV === 'development') {
    await app.register(middie);

    vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: { port: 443 },
        allowedHosts: true,
      },
      appType: 'spa',
      configFile: false,
      plugins: [react()],
      root: path.resolve(__dirname, '..', 'client'),
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '..', 'client', 'src'),
          '@shared': path.resolve(__dirname, '..', 'shared'),
          '@assets': path.resolve(__dirname, '..', 'attached_assets'),
        },
      },
    });

    // Wrap Vite middleware to skip API routes
    app.use((req: any, res: any, next: any) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/docs')) {
        return next();
      }
      vite!.middlewares(req, res, next);
    });

    app.setNotFoundHandler(async (request, reply) => {
      const url = request.url;
      
      if (url.startsWith('/api/') || url.startsWith('/docs')) {
        return reply.status(404).send({ error: 'Not Found' });
      }

      try {
        const clientTemplate = path.resolve(__dirname, '..', 'client', 'index.html');
        let template = await fs.promises.readFile(clientTemplate, 'utf-8');
        template = await vite!.transformIndexHtml(url, template);
        reply.type('text/html').send(template);
      } catch (e: any) {
        vite!.ssrFixStacktrace(e);
        reply.status(500).send(e.message);
      }
    });
  }

  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    console.log(`Pool Operations API v2 running at http://${env.HOST}:${env.PORT}`);
    console.log(`Health check: http://${env.HOST}:${env.PORT}/api/health`);
    console.log(`Admin UI: http://${env.HOST}:${env.PORT}/tech-services`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
