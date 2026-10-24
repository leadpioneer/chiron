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
  async headers() {
    const securityHeaders = [
      { key: "x-content-type-options", value: "nosniff" },
      {
        key: "referrer-policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "permissions-policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "strict-transport-security",
        value: "max-age=31536000; includeSubDomains",
      });
    }
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
