import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["impit"],
  turbopack: {
    root: path.join(__dirname),
  },
  // Keep eBay CSV seed templates inside the generate-csv serverless bundle.
  outputFileTracingIncludes: {
    "/api/generate-csv": ["./templates/**/*"],
  },
};

export default nextConfig;
