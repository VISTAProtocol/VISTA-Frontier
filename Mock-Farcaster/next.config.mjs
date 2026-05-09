/** @type {import('next').NextConfig} */
const nextConfig = {
  onDemandEntries: {
    maxInactiveAge: 15 * 1000,
    pagesBufferLength: 2,
  },
  turbopack: {
    resolveAlias: {
      "vista-protocol": "./src/lib/vista-sdk/index.mjs",
    },
  },
};

export default nextConfig;
