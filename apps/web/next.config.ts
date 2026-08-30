import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import type { NextConfig } from "next";

const rootEnvPath = resolve(process.cwd(), "../../.env.local");

if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}

process.env.NEXT_PUBLIC_CONVEX_URL ??= process.env.CONVEX_URL;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["forge"],
  reactCompiler: true,
};

export default nextConfig;
