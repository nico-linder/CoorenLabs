import { createApp } from "./app";
import { validateConfig } from "./core/config";

validateConfig();

const app = await createApp();

export default app;
