# Architecture Evidence Log

## Provider ingestion requirements

Shopify requires HMAC verification using the raw request body before processing HTTPS webhook deliveries. It also recommends persistent duplicate detection using `X-Shopify-Webhook-Id`, immediate successful acknowledgment, queue-based processing for bursts, and periodic reconciliation. Shopify states that an HTTPS request has a one-second connection timeout and a five-second overall timeout; its retry behavior can delete an Admin API subscription after repeated consecutive failures. [1]

Stripe requires an HTTPS endpoint handler to validate signatures using the raw payload and endpoint secret, and advises returning a `2xx` response before complex work. Its recovery guidance calls for persistent processing state so a manual recovery path does not double-process an event while provider retries continue. [2] [3]

## Architecture implication

The current single-process JSON-parsing capture route is an intentionally useful prototype, but it cannot safely become the production ingress without raw-body routing, provider signature verification, idempotency keys, explicit tenant ownership, append-only delivery attempts, and background reconciliation/retry work.

## Forensic integrity and telemetry requirements

OWASP advises treating operational records as sensitive assets: log/event data needs protection against unauthorized access, modification, deletion, and tampering; access should be restricted and auditable; and sensitive fields should be excluded, masked, sanitized, hashed, or encrypted as appropriate. [4]

OpenTelemetry messaging guidance frames message operations as correlated producer and consumer spans, providing a useful target for OmniMesh: one trace should connect ingestion, verification, persistence, replay, downstream delivery, and any healing decision. This creates an operator narrative rather than a disconnected table of event rows. [5]

## References

[1]: https://shopify.dev/docs/apps/build/webhooks/verify-deliveries
[2]: https://docs.stripe.com/webhooks
[3]: https://docs.stripe.com/webhooks/process-undelivered-events
[4]: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
[5]: https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/
