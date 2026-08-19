import { createOmnimeshWebhookApp } from "../../server/omnimeshWebhookApp";

// Vercel invokes this function at /api/webhooks/:provider. The public
// /webhooks/:provider paths are rewritten here in vercel.json.
const app = createOmnimeshWebhookApp("/api");

export default app;
