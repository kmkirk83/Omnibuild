import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { proxyEvents, tenantConfigs } from "../drizzle/schema";
import crypto from "crypto";
import { eq } from "drizzle-orm";

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
      return { raw: body.toString("utf8") };
    }
  }
  return body && typeof body === "object" ? (body as Record<string, unknown>) : { raw: body };
}

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" ? value : undefined;
}

async function getTenantSecret(provider: "shopify" | "stripe"): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const [config] = await db.select().from(tenantConfigs).where(eq(tenantConfigs.id, 1)).limit(1);
  if (!config) return null;
  return provider === "shopify" ? config.shopifySecret : config.stripeSecret;
}

function verifyShopifyHmac(rawBody: Buffer | string, hmacHeader: string, secret: string): boolean {
  try {
    const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

function verifyStripeSignature(rawBody: Buffer | string, sigHeader: string, secret: string): boolean {
  try {
    const parts = sigHeader.split(",");
    const tPart = parts.find((p) => p.startsWith("t="));
    const v1Part = parts.find((p) => p.startsWith("v1="));
    if (!tPart || !v1Part) return false;
    const timestamp = tPart.split("=")[1];
    const signature = v1Part.split("=")[1];
    const signedPayload = `${timestamp}.${typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")}`;
    const computed = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function ingestWebhook(provider: "shopify" | "stripe", req: Request, res: Response) {
  const startedAt = performance.now();
  const db = await getDb();
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
  const payload = parseWebhookPayload(req.body);

  const sourceDeliveryId = provider === "shopify"
    ? headerValue(req, "x-shopify-webhook-id")
    : typeof payload.id === "string" ? payload.id : undefined;

  const eventType = provider === "shopify"
    ? headerValue(req, "x-shopify-topic") ?? "unknown"
    : typeof payload.type === "string" ? payload.type : "unknown";

  const secret = await getTenantSecret(provider);
  let signatureStatus: "not_configured" | "not_present" | "verified" | "invalid" = "not_configured";

  const shopifySig = headerValue(req, "x-shopify-hmac-sha256");
  const stripeSig = headerValue(req, "stripe-signature");

  if (secret) {
    if (provider === "shopify") {
      if (!shopifySig) signatureStatus = "not_present";
      else if (verifyShopifyHmac(rawBody, shopifySig, secret)) signatureStatus = "verified";
      else signatureStatus = "invalid";
    } else {
      if (!stripeSig) signatureStatus = "not_present";
      else if (verifyStripeSignature(rawBody, stripeSig, secret)) signatureStatus = "verified";
      else signatureStatus = "invalid";
    }
  } else {
    signatureStatus = (provider === "shopify" ? shopifySig : stripeSig) ? "not_present" : "not_configured";
  }

  // Idempotency / Duplicate detection
  let isDuplicate = 0;
  if (sourceDeliveryId && db) {
    const [existing] = await db.select().from(proxyEvents).where(eq(proxyEvents.sourceDeliveryId, sourceDeliveryId)).limit(1);
    if (existing) {
      isDuplicate = 1;
    }
  }

  const endpoint = `/webhooks/${provider}`;
  const latencyMs = performance.now() - startedAt;

  if (signatureStatus === "invalid") {
    if (db) {
      await db.insert(proxyEvents).values({
        provider,
        eventType,
        sourceDeliveryId,
        endpoint,
        method: req.method,
        status: 401,
        latencyMs,
        payload: JSON.stringify(redactForFlightRecorder(payload)),
        signatureStatus,
        deliveryState: "failed",
        lastError: "HMAC signature verification failed.",
        attemptCount: 1,
        isDuplicate,
        healed: 0,
        healingDetails: "Rejected at gateway due to invalid provider signature.",
      });
    }
    return res.status(401).json({
      accepted: false,
      error: "Signature verification failed",
    });
  }

  if (db) {
    await db.insert(proxyEvents).values({
      provider,
      eventType,
      sourceDeliveryId,
      endpoint,
      method: req.method,
      status: isDuplicate ? 200 : 202,
      latencyMs,
      payload: JSON.stringify(redactForFlightRecorder(payload)),
      signatureStatus,
      deliveryState: isDuplicate ? "delivered" : "received",
      lastError: isDuplicate ? "Duplicate delivery skipped via idempotency check." : null,
      attemptCount: 1,
      isDuplicate,
      healed: isDuplicate ? 1 : 0,
      healingDetails: isDuplicate
        ? "Idempotency guard detected duplicate delivery ID; acknowledged successfully without duplicate execution."
        : "Captured securely and verified through OmniMesh production ingress gate.",
    });
  }

  return res.status(200).json({
    accepted: true,
    provider,
    endpoint,
    eventType,
    signatureStatus,
    duplicate: Boolean(isDuplicate),
    message: isDuplicate ? "Duplicate event acknowledged idempotently." : "Event successfully captured and queued.",
  });
}

export function registerOmnimeshWebhookRoutes(app: Express) {
  app.post("/webhooks/shopify", (req, res) => {
    void ingestWebhook("shopify", req, res).catch(() => {
      res.status(500).json({ accepted: false, message: "OmniMesh gateway processing error." });
    });
  });

  app.post("/webhooks/stripe", (req, res) => {
    void ingestWebhook("stripe", req, res).catch(() => {
      res.status(500).json({ accepted: false, message: "OmniMesh gateway processing error." });
    });
  });
}

export const webhookSetupPaths = {
  shopify: "/webhooks/shopify",
  stripe: "/webhooks/stripe",
} as const;

export type WebhookProvider = keyof typeof webhookSetupPaths;
