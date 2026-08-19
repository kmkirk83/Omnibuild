# OmniMesh

OmniMesh is an authenticated operational console for receiving, verifying, recording, and safely replaying Shopify and Stripe webhook deliveries.

## Local setup

Install the project dependencies, copy the environment template, and start the development server.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Do not commit `.env`. The application loads all webhook secrets from server environment variables and never accepts or persists them through the dashboard.

## Webhook configuration

| Provider | Endpoint | Required server variable | Local-development path |
|---|---|---|---|
| Stripe | `https://<your-domain>/webhooks/stripe` | `STRIPE_WEBHOOK_SECRET` | Run `stripe listen --forward-to http://localhost:3000/webhooks/stripe`, then copy the printed `whsec_…` value into `.env`. |
| Shopify | `https://<your-domain>/webhooks/shopify` | `SHOPIFY_API_SECRET` | Use the client secret of the Shopify app that created the webhook subscription. |

The ingress fails closed: a missing, invalid, or expired provider signature receives an error response and its payload is never stored. Stripe verification includes a five-minute timestamp tolerance to limit replay attempts. The dashboard and recovery controls require a signed-in administrator.

## Production rollout

Create a new Stripe webhook endpoint on the production URL (preferably a versioned endpoint such as `/webhooks/stripe-v2` for a zero-risk cutover) and immediately save its new signing secret in the deployment environment as `STRIPE_WEBHOOK_SECRET`. For Shopify, configure the app client secret as `SHOPIFY_API_SECRET`. Deploy, send a native test delivery from each provider, verify the `verified` status in Flight Recorder, then disable the legacy Stripe endpoint only after the new endpoint is confirmed.

> Stripe signing secrets are endpoint-specific and cannot be derived from Shopify. Shopify does not provide a `whsec_…` value; its HTTPS webhooks use the app client secret to generate `X-Shopify-Hmac-SHA256`.

## Validation

```bash
pnpm test
pnpm check
pnpm build
```
