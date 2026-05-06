import path from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const sdkEntry = path.resolve(__dirname, "src/lib/vista-sdk/index.mjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  onDemandEntries: {
    maxInactiveAge: 15 * 1000,
    pagesBufferLength: 2,
  },
  turbopack: {
    resolveAlias: {
      "vista-protocol": "./src/lib/vista-sdk/index.mjs",
    },
  },
  webpack: (config) => {
    config.resolve.alias["vista-protocol"] = sdkEntry;
    return config;
  },
};

export default nextConfig;
