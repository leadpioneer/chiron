import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

loadEnv({ path: path.resolve(process.cwd(), "../../.env") });
loadEnv();

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@chiron/core", "@chiron/contracts", "@chiron/db"],
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
  devIndicators: false,
};

export default nextConfig;
