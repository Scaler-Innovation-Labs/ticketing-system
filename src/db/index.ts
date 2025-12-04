
import config from '@/conf/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from "@neondatabase/serverless"
import * as schema from './schema';

const sql = neon(config.databaseUrl);

export const db = drizzle(sql, { schema });

export { sql }
