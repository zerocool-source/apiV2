import { buildApp } from './app';
import { env } from './utils/env';

async function start() {
  console.log('=== Pool Operations API Startup ===');
  console.log(`NODE_ENV: ${env.NODE_ENV}`);
  console.log(`PORT: ${env.PORT}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);
  console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? 'SET' : 'NOT SET'}`);
  console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log('===================================');

  const app = await buildApp();

  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    console.log(`Server running at http://${env.HOST}:${env.PORT}`);
    console.log(`API Docs: http://${env.HOST}:${env.PORT}/docs`);
    console.log(`Health check: http://${env.HOST}:${env.PORT}/api/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
