# OmniMesh Product Decisions

## Reliability wedge

Primary platform documentation confirms the core pain is not code generation; it is operational recovery. Stripe documents manual processing of undelivered events, warns teams to prevent duplicate processing while provider retries continue, and retains events for only a limited recovery window. Shopify states that webhook delivery is not guaranteed, does not guarantee ordering, and recommends reconciliation in addition to webhook handling. [1] [2]

OmniMesh therefore focuses on four developer-facing jobs: **capture an event safely, show its delivery state, preserve a redacted forensic record, and create an operator-controlled local replay**. The current replay action intentionally creates a safe local copy and does not call external providers or customer endpoints.

## Explicitly deferred production capabilities

Outbound delivery, provider signature verification, duplicate suppression, automatic retry scheduling, dead-letter queues, reconciliation, and endpoint alerting require provider secrets, destination configuration, and production controls. They must not be represented as complete in the current prototype. The user interface and onboarding describe only the implemented local capture, safe test, and local replay behavior.

## Founder buying signals and positioning constraints

Webhook infrastructure is a validated budget category, but the established vendors already sell delivery infrastructure, retries, signatures, retention, and enterprise support. Svix presents a free tier alongside a Professional plan beginning at $490/month with stronger availability commitments and payload retention; Hookdeck frames buying around time to market, onboarding, maintenance, tested configurations, and fewer operational surprises. [4] [5]

OmniMesh should not position as a generic alternative to a mature webhook gateway. The sharper initial promise is: **"the smallest Flight Recorder for a Stripe or Shopify integration—capture the event, understand what happened, and recreate it safely."** This makes the product useful before a team needs high-scale outbound delivery, while leaving the gateway category as a future expansion path.

## References

[1]: https://docs.stripe.com/webhooks/process-undelivered-events
[2]: https://shopify.dev/docs/apps/build/webhooks
[3]: https://hookdeck.com/webhooks/guides/webhook-retry-best-practices
[4]: https://hookdeck.com/webhooks/guides/guide-to-building-or-buying-your-webhook-infrastructure
[5]: https://www.svix.com/pricing/
