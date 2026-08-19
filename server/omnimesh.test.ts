import crypto from "crypto";
import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import { buildReplayPayload, isSafeReplayDestination } from "./omnimeshRouter";
import { parseWebhookPayload, redactForFlightRecorder, verifyShopifyHmac, verifyStripeSignature } from "./omnimeshWebhooks";

describe("OmniMesh tRPC Router", () => {
  it("should return metrics", async () => {
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "test-user", role: "admin", name: "Test Admin", email: "test@example.com", loginMethod: "oauth", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: {} as any,
      res: {} as any,
    });

    const metrics = await caller.omnimesh.metrics();
    expect(metrics).toBeDefined();
    expect(typeof metrics.totalEvents).toBe("number");
    expect(typeof metrics.healedEvents).toBe("number");
    expect(typeof metrics.activeAgents).toBe("number");
  });

  it("should list active automation agents", async () => {
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "test-user", role: "admin", name: "Test Admin", email: "test@example.com", loginMethod: "oauth", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: {} as any,
      res: {} as any,
    });

    const agents = await caller.omnimesh.listAgents();
    expect(Array.isArray(agents)).toBe(true);
  });

  it("redacts sensitive values before a Flight Recorder capture is stored", () => {
    const captured = redactForFlightRecorder({
      id: "evt_123",
      email: "buyer@example.com",
      nested: { customer: "cus_123", safeField: "kept" },
      lineItems: [{ title: "Widget", cardToken: "tok_test" }],
    });

    expect(captured).toEqual({
      id: "evt_123",
      email: "[REDACTED]",
      nested: { customer: "[REDACTED]", safeField: "kept" },
      lineItems: [{ title: "Widget", cardToken: "[REDACTED]" }],
    });
  });

  it("parses raw provider bodies without losing the original event shape", () => {
    const payload = parseWebhookPayload(Buffer.from('{"id":"evt_123","type":"checkout.session.completed"}', "utf8"));

    expect(payload).toEqual({ id: "evt_123", type: "checkout.session.completed" });
  });

  it("verifies Shopify HMAC values against the untouched request body", () => {
    const rawBody = Buffer.from('{"id":42,"email":"buyer@example.com"}', "utf8");
    const secret = "shopify_test_secret";
    const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");

    expect(verifyShopifyHmac(rawBody, signature, secret)).toBe(true);
    expect(verifyShopifyHmac(rawBody, "not-a-valid-signature", secret)).toBe(false);
  });

  it("verifies current Stripe signatures and rejects expired deliveries", () => {
    const rawBody = Buffer.from('{"id":"evt_123","type":"checkout.session.completed"}', "utf8");
    const secret = "whsec_test_secret";
    const timestamp = 1_700_000_000;
    const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
    const header = `t=${timestamp},v1=${signature}`;

    expect(verifyStripeSignature(rawBody, header, secret, timestamp * 1000)).toBe(true);
    expect(verifyStripeSignature(rawBody, header, secret, (timestamp + 301) * 1000)).toBe(false);
  });

  it("adds immutable recovery context to every replay payload", () => {
    const replay = buildReplayPayload(42, JSON.stringify({ id: "evt_123", amount: 2499 }));

    expect(replay).toMatchObject({
      id: "evt_123",
      amount: 2499,
      _omnimesh: { replayedFromEventId: 42, mode: "autonomous-destination-dispatch" },
    });
    expect(new Date(replay._omnimesh.replayedAt).toString()).not.toBe("Invalid Date");
  });

  it("only permits public HTTPS destinations for an external recovery attempt", () => {
    expect(isSafeReplayDestination("https://worker.example.com/webhooks")).toBe(true);
    expect(isSafeReplayDestination("http://worker.example.com/webhooks")).toBe(false);
    expect(isSafeReplayDestination("https://localhost:3000/webhooks")).toBe(false);
    expect(isSafeReplayDestination("https://192.168.1.20/webhooks")).toBe(false);
  });
});
