import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg";

const connectionString: string | undefined = process.env.DATABASE_URL

if (!connectionString) {
    throw new Error("DATABASE_URL not set");
}

const client = new Pool({ connectionString });
export const db = drizzle(client);

