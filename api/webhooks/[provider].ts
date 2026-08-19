import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

type Provider = "shopify" | "stripe";

function json(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function getProvider(req: IncomingMessage): Provider | null {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const segment = path.split("/").filter(Boolean).at(-1);
  return segment === "shopify" || segment === "stripe" ? segment : null;
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body exceeds the 2 MB limit.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function safeEqual(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function verifyShopify(rawBody: Buffer, header: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  return safeEqual(expected, header);
}

function verifyStripe(rawBody: Buffer, header: string, secret: string): boolean {
  const parts = header.split(",").map((part) => part.trim());
  const timestampRaw = parts.find((part) => part.startsWith("t="))?.slice(2);
  if (!timestampRaw || !/^\d+$/.test(timestampRaw)) return false;

  const timestamp = Number(timestampRaw);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${timestampRaw}.${rawBody.toString("utf8")}`).digest("hex");
  return parts.filter((part) => part.startsWith("v1=")).some((part) => safeEqual(expected, part.slice(3)));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return json(res, 405, { accepted: false, error: "Method not allowed" });
  }

  const provider = getProvider(req);
  if (!provider) return json(res, 404, { accepted: false, error: "Unknown webhook provider" });

  const secretVariable = provider === "stripe" ? "STRIPE_WEBHOOK_SECRET" : "SHOPIFY_API_SECRET";
  const secret = process.env[secretVariable]?.trim();
  if (!secret) return json(res, 503, { accepted: false, error: "Webhook verification is not configured" });

  const signatureHeader = req.headers[provider === "stripe" ? "stripe-signature" : "x-shopify-hmac-sha256"];
  if (typeof signatureHeader !== "string") return json(res, 401, { accepted: false, error: "Missing webhook signature" });

  try {
    const rawBody = await readRawBody(req);
    const valid = provider === "stripe"
      ? verifyStripe(rawBody, signatureHeader, secret)
      : verifyShopify(rawBody, signatureHeader, secret);

    if (!valid) return json(res, 401, { accepted: false, error: "Signature verification failed" });
    return json(res, 200, { accepted: true, provider, signatureStatus: "verified" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Webhook processing failed";
    const status = detail.includes("2 MB") ? 413 : 500;
    return json(res, status, { accepted: false, error: detail });
  }
}
