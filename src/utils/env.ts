import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PORT: z.string().transform(Number).default('5000'),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('*'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  if (!process.env.JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET environment variable is required.');
    console.error('Please set JWT_SECRET in Replit Secrets or Render environment variables.');
    console.error('It must be at least 32 characters long.');
    process.exit(1);
  }

  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('Environment validation failed:');
    console.error(result.error.format());
    process.exit(1);
  }
  
  return result.data;
}

export const env = validateEnv();
