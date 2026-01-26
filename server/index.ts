// Pool Operations API v2 - Fastify Server
// This file imports and starts the Fastify API server

import { buildApp } from '../src/app';

const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  HOST: process.env.HOST || '0.0.0.0',
};

async function start() {
  const app = await buildApp();

  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    console.log(`Pool Operations API v2 running at http://${env.HOST}:${env.PORT}`);
    console.log(`Health check: http://${env.HOST}:${env.PORT}/api/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
