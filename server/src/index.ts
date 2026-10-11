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

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(
    `server listening on http://${config.host}:${info.port} (site ${config.siteId}, cache ${config.cacheMode})`,
  );
});
