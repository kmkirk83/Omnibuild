import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import { parseWebhookPayload, redactForFlightRecorder } from "./omnimeshWebhooks";

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
});
