import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, repoRoot, ""),
    ...loadEnv(mode, __dirname, ""),
  };
  const port = Number(process.env.DASHBOARD_PORT || env.DASHBOARD_PORT || 3080);

  return {
    plugins: [react()],
    build: {
      outDir: "dist",
      rollupOptions: {
        output: {
          manualChunks: {
            "react-vendor": ["react", "react-dom", "react-router-dom"],
            "map-vendor": ["mapbox-gl", "react-map-gl"],
            "chart-vendor": ["recharts"],
            "data-vendor": ["d3-sankey"],
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
    server: {
      port,
      strictPort: false,
      host: true,
      proxy: {
        "/api": "http://localhost:8000",
        "/ws": { target: "ws://localhost:8000", ws: true },
      },
    },
  };
});
