/**
 * Environment variable validation.
 * Fails fast at startup if required variables are missing.
 */

const REQUIRED_VARS = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

const PRODUCTION_REQUIRED = [] as const;

export function validateEnv(): void {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (process.env.NODE_ENV === 'production') {
    for (const key of PRODUCTION_REQUIRED) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }
  }

  if (missing.length > 0) {
    console.error(
      `\n❌ Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join('\n')}\n\nCopy .env.example to .env and fill in the required values.\n`,
    );
    process.exit(1);
  }
}
