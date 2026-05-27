import nextEnv from "@next/env";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { loadEnvConfig } = nextEnv;
const appDir = dirname(fileURLToPath(import.meta.url));
const rootEnv = loadEnvConfig(resolve(appDir, "../..")).combinedEnv;

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  env: {
    NEXT_PUBLIC_API_BASE_URL:
      rootEnv.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_SUPABASE_URL:
      rootEnv.NEXT_PUBLIC_SUPABASE_URL ?? rootEnv.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      rootEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      rootEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      rootEnv.SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  }
};

export default nextConfig;
