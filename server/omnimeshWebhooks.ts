import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { proxyEvents } from "../drizzle/schema";

const SENSITIVE_FIELD = /(email|phone|address|token|secret|signature|password|card|customer)/i;
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export const webhookSetupPaths = {
  shopify: "/webhooks/shopify",
  stripe: "/webhooks/stripe",
} as const;

export type WebhookProvider = keyof typeof webhookSetupPaths;
type SignatureStatus = "not_configured" | "not_present" | "verified" | "invalid";

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

export function getWebhookSigningSecret(provider: WebhookProvider): string | null {
  const variable = provider === "shopify" ? "SHOPIFY_API_SECRET" : "STRIPE_WEBHOOK_SECRET";
  const value = process.env[variable]?.trim();
  return value || null;
}

export function getWebhookSecurityStatus() {
  const shopifyConfigured = Boolean(getWebhookSigningSecret("shopify"));
  const stripeConfigured = Boolean(getWebhookSigningSecret("stripe"));
  return {
    shopifyConfigured,
    stripeConfigured,
    signatureVerificationEnabled: shopifyConfigured || stripeConfigured,
    secretSource: "environment" as const,
  };
}

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" ? value : undefined;
}

function safeEqual(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function verifyShopifyHmac(rawBody: Buffer, hmacHeader: string, secret: string): boolean {
  try {
    const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
    return safeEqual(computed, hmacHeader);
  } catch {
    return false;
  }
}

export function verifyStripeSignature(
  rawBody: Buffer,
  sigHeader: string,
  secret: string,
  nowMs = Date.now(),
  toleranceSeconds = STRIPE_SIGNATURE_TOLERANCE_SECONDS,
): boolean {
  try {
    const parts = sigHeader.split(",").map((part) => part.trim());
    const timestampRaw = parts.find((part) => part.startsWith("t="))?.slice(2);
    if (!timestampRaw || !/^\d+$/.test(timestampRaw)) return false;

    const timestamp = Number(timestampRaw);
    if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(nowMs / 1000) - timestamp) > toleranceSeconds) {
      return false;
    }

    const signedPayload = `${timestampRaw}.${rawBody.toString("utf8")}`;
    const computed = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
    const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
    return signatures.some((signature) => safeEqual(computed, signature));
  } catch {
    return false;
  }
}

async function recordRejectedWebhook(input: {
  provider: WebhookProvider;
  eventType: string;
  sourceDeliveryId?: string;
  method: string;
  signatureStatus: SignatureStatus;
  status: number;
  detail: string;
  latencyMs: number;
}) {
  const db = await getDb();
  if (!db) return;

  await db.insert(proxyEvents).values({
    provider: input.provider,
    eventType: input.eventType,
    sourceDeliveryId: input.sourceDeliveryId,
    endpoint: webhookSetupPaths[input.provider],
    method: input.method,
    status: input.status,
    latencyMs: input.latencyMs,
    payload: null,
    signatureStatus: input.signatureStatus,
    deliveryState: "failed",
    lastError: input.detail,
    attemptCount: 1,
    isDuplicate: 0,
    healed: 0,
    healingDetails: "Ingress rejected before any unverified payload was retained or processed.",
  });
}

async function ingestWebhook(provider: WebhookProvider, req: Request, res: Response) {
  const startedAt = performance.now();
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const payload = parseWebhookPayload(rawBody);
  const sourceDeliveryId = provider === "shopify"
    ? headerValue(req, "x-shopify-webhook-id")
    : typeof payload.id === "string" ? payload.id : undefined;
  const eventType = provider === "shopify"
    ? headerValue(req, "x-shopify-topic") ?? "unknown"
    : typeof payload.type === "string" ? payload.type : "unknown";
  const signatureHeader = provider === "shopify"
    ? headerValue(req, "x-shopify-hmac-sha256")
    : headerValue(req, "stripe-signature");
  const secret = getWebhookSigningSecret(provider);
  const latencyMs = performance.now() - startedAt;

  if (!secret) {
    await recordRejectedWebhook({
      provider,
      eventType,
      sourceDeliveryId,
      method: req.method,
      signatureStatus: "not_configured",
      status: 503,
      detail: `Missing ${provider === "shopify" ? "SHOPIFY_API_SECRET" : "STRIPE_WEBHOOK_SECRET"} in the server environment.`,
      latencyMs,
    });
    return res.status(503).json({ accepted: false, error: "Webhook verification is not configured" });
  }

  if (!signatureHeader) {
    await recordRejectedWebhook({
      provider,
      eventType,
      sourceDeliveryId,
      method: req.method,
      signatureStatus: "not_present",
      status: 401,
      detail: "Required provider signature header was not present.",
      latencyMs,
    });
    return res.status(401).json({ accepted: false, error: "Missing webhook signature" });
  }

  const verified = provider === "shopify"
    ? verifyShopifyHmac(rawBody, signatureHeader, secret)
    : verifyStripeSignature(rawBody, signatureHeader, secret);
  if (!verified) {
    await recordRejectedWebhook({
      provider,
      eventType,
      sourceDeliveryId,
      method: req.method,
      signatureStatus: "invalid",
      status: 401,
      detail: "Webhook signature verification failed.",
      latencyMs,
    });
    return res.status(401).json({ accepted: false, error: "Signature verification failed" });
  }

  const db = await getDb();
  let isDuplicate = 0;
  if (sourceDeliveryId && db) {
    const [existing] = await db.select().from(proxyEvents).where(eq(proxyEvents.sourceDeliveryId, sourceDeliveryId)).limit(1);
    if (existing) isDuplicate = 1;
  }

  if (db) {
    await db.insert(proxyEvents).values({
      provider,
      eventType,
      sourceDeliveryId,
      endpoint: webhookSetupPaths[provider],
      method: req.method,
      status: isDuplicate ? 200 : 202,
      latencyMs: performance.now() - startedAt,
      payload: JSON.stringify(redactForFlightRecorder(payload)),
      signatureStatus: "verified",
      deliveryState: isDuplicate ? "delivered" : "received",
      lastError: isDuplicate ? "Duplicate delivery skipped via idempotency check." : null,
      attemptCount: 1,
      isDuplicate,
      healed: isDuplicate ? 1 : 0,
      healingDetails: isDuplicate
        ? "Idempotency guard detected duplicate delivery ID; acknowledged without duplicate execution."
        : "Verified provider webhook captured by the ingress gate.",
    });
  }

  return res.status(200).json({
    accepted: true,
    provider,
    endpoint: webhookSetupPaths[provider],
    eventType,
    signatureStatus: "verified",
    duplicate: Boolean(isDuplicate),
    message: isDuplicate ? "Duplicate event acknowledged idempotently." : "Verified event captured and queued.",
  });
}

export function registerOmnimeshWebhookRoutes(app: Express, routePrefix = "") {
  const prefix = routePrefix.replace(/\/$/, "");
  app.post(`${prefix}${webhookSetupPaths.shopify}`, (req, res) => {
    void ingestWebhook("shopify", req, res).catch(() => {
      res.status(500).json({ accepted: false, message: "OmniMesh gateway processing error." });
    });
  });

  app.post(`${prefix}${webhookSetupPaths.stripe}`, (req, res) => {
    void ingestWebhook("stripe", req, res).catch(() => {
      res.status(500).json({ accepted: false, message: "OmniMesh gateway processing error." });
    });
  });
}
