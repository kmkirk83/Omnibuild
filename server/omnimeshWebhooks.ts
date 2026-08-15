import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { proxyEvents } from "../drizzle/schema";

const SENSITIVE_FIELD = /(email|phone|address|token|secret|signature|password|card|customer)/i;

export function redactForFlightRecorder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForFlightRecorder);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        SENSITIVE_FIELD.test(key) ? "[REDACTED]" : redactForFlightRecorder(child),
      ])
    );
  }
  return value;
}

export function parseWebhookPayload(body: unknown): Record<string, unknown> {
  if (Buffer.isBuffer(body)) {
    try {
      const parsed = JSON.parse(body.toString("utf8"));
      return parsed && typeof parsed === "object" ? parsed : { value: parsed };
    } catch {
      return { raw: "[UNPARSABLE_PAYLOAD]" };
    }
  }

  return body && typeof body === "object" ? body as Record<string, unknown> : { raw: body };
}

function headerValue(req: Request, name: string) {
  const value = req.headers[name];
  return typeof value === "string" ? value : undefined;
}

async function ingestWebhook(provider: "shopify" | "stripe", req: Request, res: Response) {
  const startedAt = performance.now();
  const db = await getDb();
  const payload = parseWebhookPayload(req.body);
  const sourceDeliveryId = provider === "shopify"
    ? headerValue(req, "x-shopify-webhook-id")
    : typeof payload.id === "string" ? payload.id : undefined;
  const eventType = provider === "shopify"
    ? headerValue(req, "x-shopify-topic") ?? "unknown"
    : typeof payload.type === "string" ? payload.type : "unknown";
  const signatureHeader = headerValue(req, provider === "shopify" ? "x-shopify-hmac-sha256" : "stripe-signature");
  const signatureStatus = signatureHeader ? "not_configured" : "not_present";
  const endpoint = `/webhooks/${provider}`;
  const latencyMs = performance.now() - startedAt;

  if (db) {
    await db.insert(proxyEvents).values({
      provider,
      eventType,
      sourceDeliveryId,
      endpoint,
      method: req.method,
      status: 202,
      latencyMs,
      payload: JSON.stringify(redactForFlightRecorder(payload)),
      signatureStatus,
      deliveryState: "received",
      attemptCount: 1,
      healed: 0,
      healingDetails: "Captured with sensitive fields redacted for the OmniMesh Flight Recorder.",
    });
  }

  res.status(202).json({
    accepted: true,
    provider,
    endpoint,
    eventType,
    signatureStatus,
    message: "Webhook captured by OmniMesh. Configure provider signing secrets before production verification is enabled.",
  });
}

export function registerOmnimeshWebhookRoutes(app: Express) {
  app.post("/webhooks/shopify", (req, res) => {
    void ingestWebhook("shopify", req, res).catch(() => {
      res.status(500).json({ accepted: false, message: "OmniMesh could not ingest the Shopify webhook." });
    });
  });

  app.post("/webhooks/stripe", (req, res) => {
    void ingestWebhook("stripe", req, res).catch(() => {
      res.status(500).json({ accepted: false, message: "OmniMesh could not ingest the Stripe webhook." });
    });
  });
}

export const webhookSetupPaths = {
  shopify: "/webhooks/shopify",
  stripe: "/webhooks/stripe",
} as const;

// Provider signature verification must be configured with server-side secrets before production traffic is enabled.
export const WEBHOOK_SECURITY_NOTE = "Configure provider signing-secret verification before production use.";

export type WebhookProvider = keyof typeof webhookSetupPaths;
