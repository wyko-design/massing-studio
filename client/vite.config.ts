import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname, ".."), "");
  const port = env.SERVER_PORT ?? "8787";
  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: Number(env.PORT || 5173),
      proxy: { "/api": `http://127.0.0.1:${port}` },
    },
  };
});
