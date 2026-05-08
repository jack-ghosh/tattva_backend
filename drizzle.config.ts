import 'dotenv/config';
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dbCredentials: {
        url: process.env.DATABASE_URL!
    },
    dialect: "postgresql",
    schema: "./lib/schema.ts",
    out: "./drizzle",
});
