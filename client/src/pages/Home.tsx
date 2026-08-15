import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, ArrowRight, BookOpen, Check, CheckCircle2, Copy, Gauge, HelpCircle, Lock, Play, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Terminal, Zap } from "lucide-react";
import { toast } from "sonner";

type Provider = "shopify" | "stripe";

export default function Home() {
  const [showGuide, setShowGuide] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [copiedProvider, setCopiedProvider] = useState<Provider | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [verified, setVerified] = useState(false);
  const [replayingId, setReplayingId] = useState<number | null>(null);

  const [shopifySecretInput, setShopifySecretInput] = useState("");
  const [stripeSecretInput, setStripeSecretInput] = useState("");

  const controlPlaneUrl = typeof window !== "undefined" ? window.location.origin : "https://omnimesh.cloud";
  const endpointUrls: Record<Provider, string> = {
    shopify: `${controlPlaneUrl}/webhooks/shopify`,
    stripe: `${controlPlaneUrl}/webhooks/stripe`,
  };

  useEffect(() => {
    if (!localStorage.getItem("omnimesh_reliability_guide_seen")) setShowGuide(true);
  }, []);

  const metricsQuery = trpc.omnimesh.metrics.useQuery(undefined, { refetchInterval: 5000 });
  const eventsQuery = trpc.omnimesh.listEvents.useQuery(undefined, { refetchInterval: 5000 });
  const securityQuery = trpc.omnimesh.securityStatus.useQuery(undefined, { refetchInterval: 10000 });
  const configQuery = trpc.omnimesh.getConfig.useQuery(undefined, { refetchInterval: 10000 });

  const utils = trpc.useUtils();
  const updateConfigMutation = trpc.omnimesh.updateConfig.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      setShowSettings(false);
      utils.omnimesh.securityStatus.invalidate();
      utils.omnimesh.getConfig.invalidate();
    },
    onError: () => {
      toast.error("Failed to update tenant configuration.");
    },
  });

  const simulateMutation = trpc.omnimesh.simulateDrift.useMutation({
    onSuccess: (result) => {
      setVerified(true);
      setSimulating(false);
      metricsQuery.refetch();
      eventsQuery.refetch();
      toast.success(result.message);
    },
    onError: () => {
      setSimulating(false);
      toast.error("The test could not be completed. Try again in a moment.");
    },
  });

  const replayMutation = trpc.omnimesh.replayEvent.useMutation({
    onSuccess: (result) => {
      setReplayingId(null);
      eventsQuery.refetch();
      metricsQuery.refetch();
      toast.success(result.message);
    },
    onError: () => {
      setReplayingId(null);
      toast.error("Replay was not created. The event may no longer exist.");
    },
  });

  const runTest = () => {
    setSimulating(true);
    simulateMutation.mutate({ provider: "shopify", endpoint: "/webhooks/orders/create" });
  };

  const copyEndpoint = async (provider: Provider) => {
    try {
      await navigator.clipboard.writeText(endpointUrls[provider]);
      setCopiedProvider(provider);
      window.setTimeout(() => setCopiedProvider(null), 1800);
      toast.success(`${provider === "shopify" ? "Shopify" : "Stripe"} endpoint copied`);
    } catch {
      toast.error("Your browser could not copy the endpoint. Select and copy it manually.");
    }
  };

  const completeGuide = () => {
    localStorage.setItem("omnimesh_reliability_guide_seen", "true");
    setShowGuide(false);
    toast.success("Your reliability workspace is ready.");
  };

  const handleSaveSecrets = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfigMutation.mutate({
      shopifySecret: shopifySecretInput.trim() || undefined,
      stripeSecret: stripeSecretInput.trim() || undefined,
    });
  };

  const metrics = metricsQuery.data ?? { totalEvents: 0, healedEvents: 0, activeAgents: 0, driftCorrections: 0, avgLatencyMs: 0 };
  const events = eventsQuery.data ?? [];
  const recoveredRate = metrics.totalEvents ? Math.round((metrics.healedEvents / metrics.totalEvents) * 100) : 0;
  const signatureVerified = securityQuery.data?.signatureVerificationEnabled === true;
  const config = configQuery.data;

  const guideSlides = [
    {
      eyebrow: "Connect",
      title: "One secure endpoint. Zero guessing.",
      description: "Copy your signed provider endpoint, add it in Shopify or Stripe, and OmniMesh handles verification and idempotency automatically.",
      content: (
        <div className="guide-connection-map py-4 text-sm text-slate-300">
          <p>Incoming deliveries are validated against raw-body HMAC signatures and deduplicated via source delivery IDs.</p>
        </div>
      ),
    },
    {
      eyebrow: "Test",
      title: "Simulate recovery and schema repair instantly.",
      description: "Run a safe test event. OmniMesh validates the intake path and records the healed delivery payload.",
      content: (
        <div className="guide-test-panel space-y-3">
          {verified ? (
            <div className="guide-success flex items-center gap-2 text-emerald-400 font-medium"><CheckCircle2 /> Test passed. Recovery recorded.</div>
          ) : (
            <Button onClick={runTest} disabled={simulating} className="omni-primary-button w-full">
              {simulating ? <RefreshCw className="animate-spin mr-2" /> : <Play className="mr-2" />}
              {simulating ? "Running test..." : "Run safe test event"}
            </Button>
          )}
          <p className="text-xs text-slate-500">Safely tested locally without calling external endpoints.</p>
        </div>
      ),
    },
    {
      eyebrow: "Protect",
      title: "Flight Recorder & Idempotent Guard.",
      description: "Every payload is scrubbed of sensitive PII, checked for duplicate delivery IDs, and stored securely for audit and replay.",
      content: (
        <div className="guide-protect-panel flex items-start gap-3 bg-slate-900/80 p-4 rounded-lg border border-slate-800">
          <ShieldCheck className="text-cyan-400 h-6 w-6 mt-0.5" />
          <div className="text-left text-xs text-slate-300">
            <strong className="block text-white text-sm mb-1">Production Gate Active</strong>
            HMAC signatures, idempotency ledger, and redacted capture are ready for live deployment.
          </div>
        </div>
      ),
    },
  ];

  const currentSlide = guideSlides[guideStep];

  return (
    <div className="omni-shell min-h-screen text-slate-100 bg-slate-950 font-sans">
      <div className="omni-grid pointer-events-none fixed inset-0 opacity-20" aria-hidden="true" />

      {/* Onboarding Dialog */}
      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="omni-dialog max-w-xl border-slate-700 bg-slate-950 text-white">
          <div className="omni-dialog-glow absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
          <DialogHeader className="relative z-10">
            <div className="flex items-center justify-between gap-3">
              <div className="guide-eyebrow flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400"><BookOpen className="h-4 w-4" /> <span>{currentSlide.eyebrow}</span></div>
              <div className="guide-progress flex gap-1.5" aria-label={`Tutorial step ${guideStep + 1} of 3`}>
                {guideSlides.map((_, index) => <span key={index} className={`h-1.5 w-8 rounded-full transition-all ${index <= guideStep ? "bg-cyan-400" : "bg-slate-800"}`} />)}
              </div>
            </div>
            <div key={guideStep} className="guide-slide-enter mt-7">
              <DialogTitle className="text-3xl font-bold leading-tight tracking-tight">{currentSlide.title}</DialogTitle>
              <DialogDescription className="mt-3 max-w-md text-sm leading-6 text-slate-400">{currentSlide.description}</DialogDescription>
              <div className="mt-7">{currentSlide.content}</div>
            </div>
          </DialogHeader>
          <DialogFooter className="relative z-10 mt-6 flex items-center justify-between border-t border-slate-800 pt-5 sm:justify-between">
            {guideStep === 0 ? (
              <Button variant="ghost" onClick={completeGuide} className="text-slate-500 hover:text-slate-200">Skip for now</Button>
            ) : (
              <Button variant="ghost" onClick={() => setGuideStep(guideStep - 1)} className="text-slate-400 hover:text-white">Back</Button>
            )}
            {guideStep < guideSlides.length - 1 ? (
              <Button onClick={() => setGuideStep(guideStep + 1)} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5">
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={completeGuide} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5">
                Open workspace <Sparkles className="ml-2 h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Production Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md border-slate-700 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold"><Lock className="h-5 w-5 text-emerald-400" /> Webhook Signing Secrets</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Configure your Shopify Client Secret / Webhook Secret (`whsec_...` or Shopify HMAC secret) to enable automated raw-body signature verification.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveSecrets} className="space-y-4 mt-3">
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Shopify Webhook Secret</Label>
              <Input
                type="password"
                placeholder="shpss_..."
                value={shopifySecretInput}
                onChange={(e) => setShopifySecretInput(e.target.value)}
                className="bg-slate-900 border-slate-800 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Stripe Endpoint Secret</Label>
              <Input
                type="password"
                placeholder="whsec_..."
                value={stripeSecretInput}
                onChange={(e) => setStripeSecretInput(e.target.value)}
                className="bg-slate-900 border-slate-800 text-white"
              />
            </div>
            <DialogFooter className="pt-3">
              <Button type="button" variant="ghost" onClick={() => setShowSettings(false)} className="text-slate-400">Cancel</Button>
              <Button type="submit" disabled={updateConfigMutation.isPending} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold">
                {updateConfigMutation.isPending ? "Saving..." : "Save Secrets"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="brand-mark bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-xl text-emerald-400"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-lg font-bold tracking-tight text-white">OmniMesh</h1><Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">PRODUCTION GATE</Badge></div>
            <p className="text-xs text-slate-400">Workspace: {config?.workspaceName ?? "Default Workspace"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={() => setShowSettings(true)} className="border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800">
            <Lock className="h-3.5 w-3.5 mr-1.5 text-emerald-400" /> {signatureVerified ? "Secrets Configured" : "Configure Secrets"}
          </Button>
          <button onClick={() => { setGuideStep(0); setShowGuide(true); }} className="tutorial-trigger flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-2 bg-slate-900/60 rounded-lg border border-slate-800"><HelpCircle className="h-4 w-4" /> <span className="hidden sm:inline">How it works</span></button>
          <div className="live-chip flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full"><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Gateway online</div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 sm:px-8 space-y-8">
        <section className="hero-panel rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/40 border border-slate-800 p-8 sm:p-12 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="hero-copy max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> HMAC Signature Verification & Idempotency Active
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">Know every event.<br /><span className="text-emerald-400">Recover without guessing.</span></h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Capture incoming provider events, enforce raw-body cryptographic signatures, prevent duplicate executions, and review scrubbed payloads in the Flight Recorder.
            </p>
            <div className="hero-actions flex flex-wrap items-center gap-4 pt-2">
              <Button onClick={runTest} disabled={simulating} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-500/10">
                {simulating ? <RefreshCw className="animate-spin mr-2" /> : <Zap className="mr-2" />}
                {simulating ? "Testing..." : "Run reliability test"}
              </Button>
              <Button variant="ghost" onClick={() => { setGuideStep(0); setShowGuide(true); }} className="text-slate-300 hover:text-white">
                Take the 3-step guide <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="health-orbit relative w-64 h-64 flex items-center justify-center border border-slate-800 rounded-full bg-slate-950/60 shadow-inner">
            <div className="absolute inset-4 rounded-full border border-emerald-500/20 animate-spin" style={{ animationDuration: '25s' }} />
            <div className="absolute inset-10 rounded-full border border-cyan-500/20 animate-spin" style={{ animationDuration: '18s', animationDirection: 'reverse' }} />
            <div className="health-core text-center relative z-10 space-y-1">
              <ShieldCheck className="h-8 w-8 text-emerald-400 mx-auto" />
              <strong className="block text-white font-bold text-lg">Secure Gateway</strong>
              <span className="text-xs text-slate-400">{metrics.totalEvents} recorded events</span>
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="stats-grid grid grid-cols-1 sm:grid-cols-3 gap-4">
          <article className="stat-card bg-slate-900/75 border border-slate-800 p-6 rounded-2xl flex items-center gap-4">
            <div className="stat-icon p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><Activity className="h-6 w-6" /></div>
            <div><span>Events recorded</span><strong className="block text-2xl font-bold text-white mt-0.5">{metrics.totalEvents.toLocaleString()}</strong><small className="text-xs text-slate-500">Across connected endpoints</small></div>
          </article>
          <article className="stat-card bg-slate-900/75 border border-slate-800 p-6 rounded-2xl flex items-center gap-4">
            <div className="stat-icon p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"><Sparkles className="h-6 w-6" /></div>
            <div><span>Recovery actions</span><strong className="block text-2xl font-bold text-white mt-0.5">{metrics.healedEvents.toLocaleString()}</strong><small className="text-xs text-slate-500">{recoveredRate}% repaired or deduplicated</small></div>
          </article>
          <article className="stat-card bg-slate-900/75 border border-slate-800 p-6 rounded-2xl flex items-center gap-4">
            <div className="stat-icon p-3 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/20"><Gauge className="h-6 w-6" /></div>
            <div><span>Average intake</span><strong className="block text-2xl font-bold text-white mt-0.5">{metrics.avgLatencyMs.toFixed(1)}ms</strong><small className="text-xs text-slate-500">Verified & logged</small></div>
          </article>
        </section>

        {/* Workspace Grid */}
        <section className="workspace-grid grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="endpoint-card border-slate-800 bg-slate-900/75">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base text-white"><Terminal className="h-4 w-4 text-emerald-400" /> Connect endpoints</CardTitle><CardDescription className="text-slate-400">Paste these URLs into your Shopify or Stripe webhook settings.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {(["shopify", "stripe"] as Provider[]).map((provider) => (
                <div key={provider} className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider">
                    <span>{provider === "shopify" ? "Shopify Webhook URL" : "Stripe Endpoint URL"}</span>
                    <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">SECURE</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs text-cyan-300 font-mono truncate">{endpointUrls[provider]}</code>
                    <Button size="sm" variant="ghost" onClick={() => copyEndpoint(provider)} className="h-8 px-3 text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800">
                      {copiedProvider === provider ? <Check className="h-3.5 w-3.5 text-emerald-400 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      <span>{copiedProvider === provider ? "Copied" : "Copy"}</span>
                    </Button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Sensitive PII is scrubbed before storing in the Flight Recorder.</p>
            </CardContent>
          </Card>

          <Card className="protect-card border-slate-800 bg-slate-900/75">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base text-white"><ShieldCheck className="h-4 w-4 text-cyan-400" /> Production Readiness Checklist</CardTitle><CardDescription className="text-slate-400">Your live security gates.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-xs"><Check className="h-3.5 w-3.5" /></span>
                  <div><strong className="text-sm text-white block">Raw-Body Capture</strong><small className="text-xs text-slate-400">Incoming payload buffers preserved for signature validation.</small></div>
                </div>
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">ONLINE</Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex items-center gap-3">
                  <span className={`h-6 w-6 rounded-full ${signatureVerified ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-amber-500/10 border border-amber-500/30 text-amber-400"} flex items-center justify-center text-xs`}>
                    {signatureVerified ? <Check className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  </span>
                  <div><strong className="text-sm text-white block">HMAC Signature Verification</strong><small className="text-xs text-slate-400">{signatureVerified ? "Secrets are configured and verifying live requests." : "Configure signing secrets to lock down ingress."}</small></div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowSettings(true)} className="h-7 text-xs border-slate-700 bg-slate-900 text-slate-200">
                  {signatureVerified ? "Verified" : "Setup Secrets"}
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-xs"><Check className="h-3.5 w-3.5" /></span>
                  <div><strong className="text-sm text-white block">Idempotency Guard</strong><small className="text-xs text-slate-400">Source delivery IDs automatically prevent duplicate processing.</small></div>
                </div>
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">ACTIVE</Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Flight Recorder Section */}
        <section className="flight-section space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">FLIGHT RECORDER</span>
              <h3 className="text-xl font-bold text-white mt-0.5">Event history, with secure local replay.</h3>
              <p className="text-xs text-slate-400 mt-1">Every event is logged with delivery status and signature state. Replay safely without calling external services.</p>
            </div>
            <Button onClick={runTest} disabled={simulating} variant="outline" className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800">
              {simulating ? <RefreshCw className="animate-spin mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />} Run test event
            </Button>
          </div>

          <Card className="flight-table-card border-slate-800 bg-slate-900/75 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-950/60">
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-400">EVENT</TableHead>
                  <TableHead className="text-slate-400">PROVIDER</TableHead>
                  <TableHead className="text-slate-400">DELIVERY</TableHead>
                  <TableHead className="text-slate-400">SIGNATURE</TableHead>
                  <TableHead className="text-slate-400">DETAIL</TableHead>
                  <TableHead className="text-right text-slate-400">RECOVER</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length ? events.map((event: any) => (
                  <TableRow key={event.id} className="border-slate-800/60 hover:bg-slate-800/30">
                    <TableCell><div className="flex flex-col"><span className="font-mono font-bold text-white text-xs">#{event.id}</span><small className="text-slate-500 text-[11px]">{event.eventType || "unknown"}</small></div></TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] uppercase border-slate-700 text-slate-300">{event.provider}</Badge></TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${event.isDuplicate ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : event.deliveryState === 'delivered' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" /> {event.isDuplicate ? "duplicate" : event.deliveryState || "received"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] uppercase ${event.signatureStatus === 'verified' ? 'border-emerald-500/30 text-emerald-400' : event.signatureStatus === 'invalid' ? 'border-red-500/30 text-red-400' : 'border-slate-700 text-slate-400'}`}>
                        {event.signatureStatus || 'not_configured'}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[280px]"><p className="text-xs text-slate-300 truncate">{event.healingDetails || event.lastError || "Captured securely"}</p></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => { setReplayingId(event.id); replayMutation.mutate({ eventId: event.id }); }} disabled={replayingId === event.id} className="h-7 text-xs text-slate-300 hover:text-white bg-slate-800/40 hover:bg-slate-800">
                        {replayingId === event.id ? <RefreshCw className="animate-spin mr-1.5 h-3 w-3" /> : <RotateCcw className="mr-1.5 h-3 w-3 text-cyan-400" />} {replayingId === event.id ? "Replaying" : "Replay"}
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={6} className="h-36 text-center text-sm text-slate-500">No events yet. Copy an endpoint above or run the safe test event.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </section>
      </main>
    </div>
  );
}
