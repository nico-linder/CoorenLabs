import { createApp } from "./app";
import { PORT, validateConfig } from "./core/config";
import { Logger } from "./core/logger";
import { isDeno } from "./core/runtime";

validateConfig();

const app = await createApp();

const isVercel = Boolean(process.env.VERCEL);

if (isDeno) {
  // @ts-expect-error - Deno global
  Deno.serve({ port: PORT }, app.fetch);
} else if (!isVercel) {
  app.listen(PORT);
  Logger.info(`Started at http://localhost:${PORT}`);
}

export default app;
