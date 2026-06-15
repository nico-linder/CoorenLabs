import { createApp } from "../src/app";
import { validateConfig } from "../src/core/config";

validateConfig();

const app = await createApp();

export default app;
