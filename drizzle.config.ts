import * as dotenv from 'dotenv';

dotenv.config({
  path: '.env.local',
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in environment variables || .env.local file");
}

export default {
  out: './src/db/drizzle',
  schema: [
    './src/db/schema.ts',
    './src/db/schema-tickets.ts',
    './src/db/schema-queue.ts',
    './src/db/schema-notifications.ts',
  ],
  dialect: 'postgresql' as const,
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    table: "__drizzle_migration",
    schema: "public",
  },
  verbose: true,
  strict: true,
};