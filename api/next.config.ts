import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / non-bundleable server SDKs load from node_modules at runtime.
  serverExternalPackages: [
    "@buildonspark/spark-sdk",
    "mppx",
    "viem",
    "@google/genai",
  ],
};

export default nextConfig;
