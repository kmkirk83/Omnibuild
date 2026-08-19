import express, { type Express } from "express";
import { registerOmnimeshWebhookRoutes, webhookSetupPaths } from "./omnimeshWebhooks";

/**
 * Creates the smallest possible ingress app for provider webhooks. It is used
 * by the long-running Express server and by the Vercel serverless functions so
 * both runtimes verify exactly the same untouched request body.
 */
export function createOmnimeshWebhookApp(routePrefix = ""): Express {
  const app = express();
  const prefix = routePrefix.replace(/\/$/, "");
  app.use(`${prefix}${webhookSetupPaths.shopify}`, express.raw({ type: "application/json", limit: "2mb" }));
  app.use(`${prefix}${webhookSetupPaths.stripe}`, express.raw({ type: "application/json", limit: "2mb" }));
  registerOmnimeshWebhookRoutes(app, prefix);
  return app;
}
