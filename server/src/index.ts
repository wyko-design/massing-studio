import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";

try {
  process.loadEnvFile();
} catch {
  // no .env yet: defaults apply
}

const config = loadConfig();
const app = createApp({ config });

serve({ fetch: app.fetch, hostname: "127.0.0.1", port: config.port }, (info) => {
  console.log(
    `server listening on http://127.0.0.1:${info.port} (site ${config.siteId}, cache ${config.cacheMode})`,
  );
});
