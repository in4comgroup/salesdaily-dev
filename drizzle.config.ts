import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

config({ path: ".env" })

export default defineConfig({
  schema: "./src/db/schema.ts",
  // Draft generation only. Never run drizzle-kit migrate/push against a stand.
  // Reviewed SQL is added to db/migrations/manifest.json; run db:migrate.
  out: "./tmp/drizzle-drafts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
