# OmniMesh Tool-Stack Decision

## Verified skill discovery outcome

The verified-skill search was run through the Internet Skill Finder against its supported repositories using the terms **"webhook reliability replay developer tools"** and **"API integration testing developer workflow"**. The real-time fetch failed across its source repositories, then the local cache returned no matching skills. There is therefore no verified specialist skill to import for this narrow workflow at this time.

## Selected implementation stack

| Need | Selected component | Rationale |
|---|---|---|
| Capture and event lifecycle | Express routes + Drizzle/MySQL | Already present in the project; supports durable delivery state and replay lineage without introducing another runtime. |
| Safe Flight Recorder | Redaction helper + persisted event snapshots | Captures the actual debugging artifact while masking common sensitive fields before storage. |
| Operator recovery | tRPC local replay mutation | Creates a safe local replay record without silently sending data to an external customer or provider. |
| Product UI | React + existing shadcn primitives + CSS motion | Provides a focused developer interface and motion without adding a new animation dependency. |
| Regression and browser validation | Vitest + Playwright | Covers server redaction logic and verifies the guided test and replay flows in the running application. |

## Rejected for the current MVP

Mature webhook platforms such as Svix and Hookdeck are validated market alternatives, not dependencies for this prototype. Adding them would turn OmniMesh into a resale wrapper instead of validating its own Flight Recorder wedge. Provider SDKs and secrets are intentionally deferred until a user connects a real Shopify or Stripe account; that is when signature verification, idempotency, outbound delivery, retry schedules, and reconciliation become mandatory.
