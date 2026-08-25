import { defineConfig } from "drizzle-kit";
import { DATABASE_URL } from "./lib/env";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url: DATABASE_URL() },
  verbose: true,
  strict: true,
});
