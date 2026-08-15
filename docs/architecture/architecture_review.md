# OmniMesh Architecture Review and Revision Plan

## Executive Summary

OmniMesh has a credible product wedge: a **Webhook Flight Recorder** that helps a developer capture an integration event, understand its state, and safely reproduce it without touching a customer or external provider. The existing product is materially stronger than a generic dashboard because it already presents a guided **Connect → Test → Protect** flow, redacts common sensitive fields, persists delivery records, and creates safe local replay records.

The review found one central architecture gap: the current implementation is a **useful sandbox capture plane**, not yet a production-grade webhook ingress. The most important revisions are therefore not visual. They are to make the trust boundary explicit, preserve raw request integrity, identify duplicate deliveries deterministically, separate fast acknowledgement from downstream work, and restrict operational artifacts by tenant. This report distinguishes what is operational today from what must be built before a user points production Shopify or Stripe traffic at OmniMesh.

## Review Disciplines

| Discipline | Standard applied | Why it matters for OmniMesh |
|---|---|---|
| Reliability engineering | Fast acknowledgement, durable event state, idempotency, retries, reconciliation | Providers retry and can duplicate or reorder deliveries; a missing event can become an order, billing, or fulfillment incident. [1] [2] [3] |
| Security engineering | Raw-body signature verification, least privilege, secret isolation, protected forensic records | Webhook payloads and signatures establish origin; payloads may contain high-value customer data. [1] [2] [4] |
| Data engineering | Append-only delivery attempts, immutable correlation IDs, traceable state transitions | Operators need to reconstruct what happened without overwriting evidence. [4] [5] |
| Developer experience | Short onboarding, provider-specific instructions, explainable recovery actions | The first useful outcome should be a verified event, not learning distributed-systems vocabulary. |
| Product strategy | Focused wedge before gateway expansion | Mature platforms already sell generic delivery infrastructure; OmniMesh should win first on safe diagnosis and recovery. |

## What Is Real Today

| Capability | Current state | Evidence in application | Product claim permitted |
|---|---|---|---|
| Guided onboarding | **Implemented** | Animated three-step Connect → Test → Protect guide | A developer can learn the basic workflow quickly. |
| Provider capture paths | **Implemented, sandbox-grade** | `POST /webhooks/shopify` and `POST /webhooks/stripe` preserve raw request bodies before parsing and persist records | OmniMesh can accept and record development capture traffic while keeping the raw-body prerequisite for future verification. |
| Sensitive-field masking | **Implemented, baseline** | Recursive key-based redaction before persisted capture | Commonly named sensitive fields are masked before Flight Recorder storage. |
| Delivery lifecycle | **Implemented, baseline** | `received`, `delivered`, `failed`, and `replayed` state model | The Flight Recorder exposes high-level delivery state. |
| Safe replay | **Implemented** | Replay creates a local record; it does not call a third party | Developers can reproduce an event locally without external side effects. |
| Recovery test | **Implemented, simulated** | Simulated drift creates a repaired event and explanatory record | A developer can test the interaction model, not a real provider integration. |
| Signature verification | **Not yet configured** | Current JSON ingress runs before provider verification | Do not connect production provider traffic yet. |
| Duplicate prevention | **Not yet implemented** | No provider delivery ID or tenant-scoped idempotency ledger | Replay and recovery must not be treated as production-safe idempotent processing. |
| Retried delivery and reconciliation | **Not yet implemented** | No durable queue, worker, retry schedule, or reconciliation job | The current app is not a replacement for a production event gateway. |
| Tenant isolation | **Not yet implemented** | Events are not assigned to a protected workspace owner | Do not use the current store for multi-customer production data. |

## Why the Revision Is Necessary

Shopify requires verification against the **raw request body**, recommends duplicate detection through `X-Shopify-Webhook-Id`, and advises returning a successful response quickly; it documents a one-second connection timeout and five-second total request timeout. [1] Stripe likewise requires signature verification against the raw payload and recommends returning a `2xx` response before complex processing. [2] Both providers require an architecture where inbound acknowledgment is fast and durable, while validation, healing, routing, and recovery work happen asynchronously.

The current OmniMesh route uses application-level JSON parsing before its capture logic. That is appropriate for a prototype but conflicts with raw-body verification requirements. It also treats a webhook row as both a capture record and a delivery record, which makes later attempts, errors, and replay lineage difficult to model cleanly. The target design separates the immutable **event envelope** from append-only **delivery attempts**, allowing the UI to answer the questions a developer actually asks: *Was this provider event authentic? Was it seen before? Where did it fail? What changed? Can I reproduce it safely?*

## Baseline Architecture Under Review

The baseline application had a straightforward request path. Provider traffic reached Express, JSON was parsed, a redacted payload was inserted into `proxy_events`, and a `202` response was returned. The dashboard read the same table through public RPC routes; simulated healing and safe local replay also wrote back to it. This is an effective proof of interaction design, but it combined authentication, provenance, tenant scope, and recovery state in a single layer.

See **`omnimesh_current_architecture.png`** for this pre-revision baseline map.

## Architecture Revision Applied in This Iteration

The project now registers provider-specific raw-body middleware **before** global JSON parsing. Captures now retain a provider delivery identifier when available, extract Shopify topic or Stripe payload type correctly, record whether a signature was absent or present-but-not-yet-configured, and show that raw-body readiness in the control plane. This does not activate production verification; it removes the structural obstacle that would make future verification impossible.

The baseline diagram was re-rendered and reviewed after this clarification. It now explicitly labels the JSON-first route as the pre-revision architecture, preventing an operator from confusing it with the current raw-body capture foundation.

## Target Architecture

The target architecture creates a clear boundary at ingress. A provider-specific raw request route first resolves a tenant-owned endpoint configuration, verifies the provider signature, checks a stable delivery ID against a tenant-scoped idempotency ledger, writes an immutable event envelope and initial attempt, and acknowledges promptly. A durable worker then handles normalization, compatibility rules, optional healing proposals, downstream delivery, retry policy, and reconciliation. The Flight Recorder is a restricted read model built from redacted artifacts and correlated traces—not a public table of payload rows.

See **`omnimesh_target_architecture.png`** for the target system map and **`omnimesh_delivery_lifecycle.png`** for the intended event state transitions.

Diagram review confirmed that the target-state design is readable at a high level: the ingress trust boundary, idempotency split, asynchronous worker, forensic artifact store, dead-letter path, and protected control plane are visually distinct. The delivery lifecycle design makes the production-only states explicit—`rejected`, `duplicate`, `queued`, `processing`, `retry_scheduled`, and `dead_lettered`—which keeps the current safe local replay model separate from a later operator-approved replay path.

## Improvement Plan and Rationale

| Priority | Revision | Why it changes the outcome | Delivery state |
|---|---|---|---|
| P0 | Add raw-body ingress, provider verification status, and provider delivery identifiers | Makes provenance observable and creates the prerequisite for HMAC verification and idempotency. [1] [2] | Implement now as a configurable foundation; secrets remain user-supplied. |
| P0 | Split event envelope from delivery attempts and scope records to an owner/workspace | Prevents evidence from being overwritten and establishes a tenant boundary. | Design now; implement schema incrementally before multi-tenant launch. |
| P0 | Protect operational actions and payload access with authenticated procedures | Prevents unauthenticated users from inspecting or replaying operational artifacts. [4] | Target-state requirement; add once login-gated workspaces are activated. |
| P1 | Add durable queue, retry policy, dead-letter state, and reconciliation connector | Acknowledgement must remain fast even when repair and delivery take time. [1] [2] [3] | Target-state requirement; needs persistent worker/queue hosting. |
| P1 | Add trace IDs and OpenTelemetry-compatible telemetry | Joins provider ingress, normalization, replay, and downstream delivery into one incident narrative. [5] | Target-state requirement. |
| P1 | Replace blanket “AI healing” claims with policy-backed repair proposals | Developers need visible, reviewable transformations before automated side effects. | Product positioning revision now; automation only after rule governance exists. |
| P2 | Add retention controls, encryption policy, audit history, and access reviews | Flight Recorder artifacts are sensitive operational records. [4] | Target-state requirement. |

## Product Design Revision

The product should continue to lead with the current promise: **“Know every event. Recover without guessing.”** The improved information architecture is intentional. The main page remains focused on endpoint setup, a test event, protection readiness, and the Flight Recorder. Advanced infrastructure concepts—queues, trace context, idempotency policies, and reconciliation—belong in a dedicated **Reliability Settings** area with plain-language explanations and safe defaults. This preserves the low-cognitive-load developer experience while allowing the architecture to mature behind it.

The motion system is also purposeful. Animated ingress paths, health beacons, state transitions, and replay feedback help developers recognize state changes; they do not communicate false uptime or hide system uncertainty. The UI explicitly marks provider verification as setup-required until secrets are configured.

## Release Gate Before Production Provider Traffic

Production Shopify or Stripe traffic must remain disabled until signature verification, tenant ownership, duplicate detection, protected access, and a durable asynchronous worker are in place. After that, the correct first production pilot is one provider, one tenant, one event family, a restricted retention period, and an operator-visible replay path. This is the smallest scope that can produce meaningful reliability evidence without pretending to be a generic event gateway.

## References

[1]: [Shopify, *Verify webhook deliveries*](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
[2]: [Stripe, *Receive Stripe events in your webhook endpoint*](https://docs.stripe.com/webhooks)
[3]: [Stripe, *Process undelivered webhook events*](https://docs.stripe.com/webhooks/process-undelivered-events)
[4]: [OWASP, *Logging Cheat Sheet*](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
[5]: [OpenTelemetry, *Semantic conventions for messaging spans*](https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/)
