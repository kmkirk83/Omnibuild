import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Provider = "shopify" | "stripe";

const setup = {
  shopify: {
    label: "Shopify",
    destination: "Your app's Webhooks configuration",
    secret: "Shopify webhook HMAC secret",
    test: "Send a test delivery from Shopify, then open the matching event in Flight Recorder.",
    events: "orders/create, orders/updated, fulfillment_events/create",
  },
  stripe: {
    label: "Stripe",
    destination: "Developers → Webhooks → Add endpoint",
    secret: "Stripe endpoint signing secret (whsec_...)",
    test: "Use Send test webhook in Stripe, then open the matching event in Flight Recorder.",
    events: "payment_intent.succeeded, checkout.session.completed, charge.refunded",
  },
} as const;

export function ProviderQuickstart({ baseUrl }: { baseUrl: string }) {
  const [provider, setProvider] = useState<Provider>("shopify");
  const [copied, setCopied] = useState(false);
  const details = setup[provider];
  const url = `${baseUrl}/webhooks/${provider}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success(`${details.label} endpoint copied`);
    } catch {
      toast.error("Copy the endpoint manually from the field.");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">ECOSYSTEM QUICKSTART</span>
          <h3 className="mt-1 text-xl font-bold text-white">Install into the tools your team already uses.</h3>
          <p className="mt-1 text-sm text-slate-400">Connect a provider, send one test event, then use OmniMesh only when an incident needs an answer.</p>
        </div>
        <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-1">
          {(["shopify", "stripe"] as Provider[]).map((item) => (
            <button key={item} onClick={() => setProvider(item)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${provider === item ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>
              {setup[item].label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">1. Add an endpoint</p>
            <p className="mt-1 text-sm text-white">In <span className="text-cyan-300">{details.destination}</span>, paste this URL.</p>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2.5">
              <code className="min-w-0 flex-1 truncate text-xs text-cyan-300">{url}</code>
              <Button onClick={copy} size="sm" variant="ghost" className="h-7 text-xs text-slate-300 hover:text-white">
                {copied ? <Check className="mr-1 h-3 w-3 text-emerald-400" /> : <Copy className="mr-1 h-3 w-3" />}{copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">2. Secure it</p>
            <p className="mt-1 text-sm text-white">Add your <span className="text-emerald-300">{details.secret}</span> in OmniMesh.</p>
            <p className="mt-1 text-xs text-slate-400">Raw request bodies are verified before any event is captured or replayed.</p>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">FIRST INCIDENT READY</Badge>
          <p className="mt-3 text-sm font-semibold text-white">3. Prove recovery once.</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">{details.test}</p>
          <p className="mt-4 text-[11px] text-slate-500">Recommended events: {details.events}</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-300"><ShieldCheck className="h-4 w-4" /> Capture → explain → replay → prove recovery</div>
        </div>
      </div>
    </section>
  );
}
