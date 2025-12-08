import { migrate } from "drizzle-orm/neon-http/migrator";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless"
import config from "@/conf/config";


const DATABASE_URL: string = config.databaseUrl;

if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in environment variables || .env.local file");
}

async function runMigrations() {
    try {
        const sql = neon(DATABASE_URL);
        const db = drizzle(sql);

        await migrate(db, { migrationsFolder: "./drizzle" });

        console.log("Migrations applied successfully");
    } catch (error) {
        console.log("Error applying migrations:", error);
        process.exit(1);
    }
}

runMigrations();