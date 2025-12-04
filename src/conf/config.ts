import * as dotenv from 'dotenv';

dotenv.config({
    path: '.env.local',
});

interface Config {
    databaseUrl: string;
}

const config: Config = {
    databaseUrl: process.env.DATABASE_URL || "",
}

export default config;