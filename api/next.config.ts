import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Lightning SDK ships TypeScript source only (no prebuilt dist) straight
  // from GitHub, so Next transpiles it. Its package `exports` expose a `ts`
  // condition pointing at src/*.ts, which we prefer via `conditionNames` below.
  transpilePackages: ["@buildonspark/lightning-mpp-sdk"],
  // Native / non-bundleable server SDKs load from node_modules at runtime.
  serverExternalPackages: [
    "@buildonspark/spark-sdk",
    "mppx",
    "viem",
    "@google/genai",
  ],
  webpack: (config) => {
    // Prefer the SDK's `ts` export condition so it resolves to its TS source.
    config.resolve.conditionNames = ["ts", "..."];
    // The SDK source uses ESM `.js` import specifiers that map to `.ts` files.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ...(config.resolve.extensionAlias ?? {}),
    };
    return config;
  },
};

export default nextConfig;
