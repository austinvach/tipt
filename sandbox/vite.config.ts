import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rawPort = process.env.PORT || "5173";
const port = Number(rawPort);
const projectRoot = path.resolve(import.meta.dirname);
const attachedAssetsRoot = path.resolve(import.meta.dirname, "attached_assets");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src"),
      "@assets": attachedAssetsRoot,
    },
  },
  build: {
    outDir: path.resolve(projectRoot, "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 6200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll("\\\\", "/");

          if (normalized.includes("/sdk/")) {
            return "mpp-sdk";
          }

          if (!normalized.includes("/node_modules/")) {
            return;
          }

          if (normalized.includes("/react/") || normalized.includes("/react-dom/")) {
            return "react-vendor";
          }

          if (normalized.includes("/wouter/")) {
            return "router-vendor";
          }

          if (normalized.includes("/lucide-react/")) {
            return "icon-vendor";
          }

          if (normalized.includes("/@buildonspark/spark-sdk/")) {
            return "spark-sdk-vendor";
          }

          if (normalized.includes("/lightning-mpp-extension-sdk/")) {
            return "mpp-extension-vendor";
          }

          return;
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "https://tiptapi.vercel.app",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      allow: [projectRoot, attachedAssetsRoot],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
