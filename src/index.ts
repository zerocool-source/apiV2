import { buildApp } from './app';
import { env } from './utils/env';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    console.log(`Server running at http://${env.HOST}:${env.PORT}`);
    console.log(`Health check: http://${env.HOST}:${env.PORT}/api/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
