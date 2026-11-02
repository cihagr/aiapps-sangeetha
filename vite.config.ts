import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'
  // Proxy targets come from .env (VITE_AI_URL, VITE_KB_BLOB_HOST) - never hardcode them here.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    server: isDev
      ? {
          host: "::",
          port: 8080,
          cors: {
            origin: true,
            credentials: true,
          },
          // Dev-only proxy. In production, your app will call the absolute API URL directly.
          proxy: {
            '/api': {
              target: env.VITE_AI_URL,
              changeOrigin: true,
              secure: false,
              rewrite: (p) => p.replace(/^\/api/, '/ai-apps/api'),
            },
            // Question images live in a blob container that sends no CORS header, so
            // the browser cannot read their bytes to embed them in the Word/Excel
            // exports. Serving them same-origin sidesteps that.
            // See BLOB_IMAGE_PROXY in src/utils/exportImages.ts.
            '/blob-image': {
              target: env.VITE_KB_BLOB_HOST,
              changeOrigin: true,
              secure: true,
              rewrite: (p) => p.replace(/^\/blob-image/, '/esaiknowledgebase'),
            },
          },
        }
      : {
          host: "::",
          port: 8080,
          cors: {
            origin: true,
            credentials: true,
          },
        },
    plugins: [
      react(),
      isDev && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts",
    },
  }
});
