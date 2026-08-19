import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["impit", "sharp"],
  turbopack: {
    root: path.join(__dirname),
  },
  // Keep eBay CSV seed templates inside the generate-csv serverless bundle.
  // Sharp's linux libvips .so is an optional nested dep that NFT often drops.
  outputFileTracingIncludes: {
    "/api/generate-csv": ["./templates/**/*"],
    "/*": [
      "./node_modules/sharp/**/*",
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
};

export default nextConfig;
