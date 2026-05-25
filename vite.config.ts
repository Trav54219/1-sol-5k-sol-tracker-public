import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const convexSiteUrl = env.VITE_CONVEX_SITE_URL?.replace(/\/$/, "");

  return {
  plugins: [react()],
  server: {
    ...(convexSiteUrl
      ? {
          proxy: {
            "/api/whop": {
              target: convexSiteUrl,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api\/whop/, "/whop"),
            },
          },
        }
      : {}),
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    hmr: {
      host: "127.0.0.1",
      clientPort: 5173,
    },
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
};
});
