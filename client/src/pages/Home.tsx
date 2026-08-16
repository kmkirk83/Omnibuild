import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, ArrowRight, BookOpen, Check, CheckCircle2, Copy, Gauge, Globe, HelpCircle, Lock, Play, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Terminal, Zap } from "lucide-react";
import { toast } from "sonner";

type Provider = "shopify" | "stripe";

export default function Home() {
  const [showGuide, setShowGuide] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [copiedProvider, setCopiedProvider] = useState<Provider | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [verified, setVerified] = useState(false);
  const [replayingId, setReplayingId] = useState<number | null>(null);

  const [shopifySecretInput, setShopifySecretInput] = useState("");
  const [stripeSecretInput, setStripeSecretInput] = useState("");

  const [destNameInput, setDestNameInput] = useState("");
  const [destUrlInput, setDestUrlInput] = useState("");

  const controlPlaneUrl = typeof window !== "undefined" ? window.location.origin : "https://omnimesh.cloud";
  const endpointUrls: Record<Provider, string> = {
    shopify: `${controlPlaneUrl}/webhooks/shopify`,
    stripe: `${controlPlaneUrl}/webhooks/stripe`,
  };

  useEffect(() => {
    if (!localStorage.getItem("omnimesh_autonomous_guide_seen")) setShowGuide(true);
  }, []);

  const metricsQuery = trpc.omnimesh.metrics.useQuery(undefined, { refetchInterval: 5000 });
  const eventsQuery = trpc.omnimesh.listEvents.useQuery(undefined, { refetchInterval: 5000 });
  const destinationsQuery = trpc.omnimesh.listDestinations.useQuery(undefined, { refetchInterval: 10000 });
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

  const upsertDestinationMutation = trpc.omnimesh.upsertDestination.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      setShowDestinationModal(false);
      setDestNameInput("");
      setDestUrlInput("");
      utils.omnimesh.listDestinations.invalidate();
    },
    onError: () => {
      toast.error("Failed to save delivery destination.");
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
      toast.error("Replay was not created.");
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
      toast.error("Manual copy required by browser restrictions.");
    }
  };

  const completeGuide = () => {
    localStorage.setItem("omnimesh_autonomous_guide_seen", "true");
    setShowGuide(false);
    toast.success("Autonomous delivery platform active.");
  };

  const handleSaveSecrets = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfigMutation.mutate({
      shopifySecret: shopifySecretInput.trim() || undefined,
      stripeSecret: stripeSecretInput.trim() || undefined,
    });
  };

  const handleSaveDestination = (e: React.FormEvent) => {
    e.preventDefault();
    if (!destNameInput || !destUrlInput) {
      toast.error("Please provide both destination name and target URL.");
      return;
    }
    upsertDestinationMutation.mutate({
      name: destNameInput.trim(),
      targetUrl: destUrlInput.trim(),
      providerFilter: "all",
    });
  };

  const metrics = metricsQuery.data ?? { totalEvents: 0, healedEvents: 0, activeAgents: 0, driftCorrections: 0, avgLatencyMs: 0 };
  const events = eventsQuery.data ?? [];
  const destinations = destinationsQuery.data ?? [];
  const recoveredRate = metrics.totalEvents ? Math.round((metrics.healedEvents / metrics.totalEvents) * 100) : 0;
  const signatureVerified = securityQuery.data?.signatureVerificationEnabled === true;
  const config = configQuery.data;

  const guideSlides = [
    {
      eyebrow: "Autonomous Rollout",
      title: "Zero-loss webhook delivery & retry orchestration.",
      description: "OmniMesh intercepts provider events, verifies raw-body HMAC signatures, applies idempotency guards, and fans out reliably across configured destinations.",
      content: (
        <div className="py-4 text-sm text-slate-300">
          <p className="leading-relaxed">Configured with automated retry backoff, dead-letter routing, and a secure Flight Recorder for offline debugging.</p>
        </div>
      ),
    },
    {
      eyebrow: "Live Test",
      title: "Simulate provider drift & auto-healing.",
      description: "Trigger a test webhook intake to verify the gateway, PII redaction, and autonomous schema healer.",
      content: (
        <div className="space-y-3 py-2">
          {verified ? (
            <div className="flex items-center gap-2 text-emerald-400 font-medium"><CheckCircle2 className="h-5 w-5" /> Ingress verified and healed.</div>
          ) : (
            <Button onClick={runTest} disabled={simulating} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold w-full">
              {simulating ? <RefreshCw className="animate-spin mr-2" /> : <Play className="mr-2" />}
              {simulating ? "Running test..." : "Run intake & healing test"}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const currentSlide = guideSlides[guideStep];

  return (
    <div className="omni-shell min-h-screen text-slate-100 bg-slate-950 font-sans">
      <div className="omni-grid pointer-events-none fixed inset-0 opacity-20" aria-hidden="true" />

      {/* Guide Dialog */}
      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="max-w-xl border-slate-700 bg-slate-950 text-white">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{currentSlide.eyebrow}</span>
              <div className="flex gap-1.5">
                {guideSlides.map((_, i) => <span key={i} className={`h-1.5 w-8 rounded-full ${i <= guideStep ? "bg-cyan-400" : "bg-slate-800"}`} />)}
              </div>
            </div>
            <DialogTitle className="text-2xl font-bold mt-4">{currentSlide.title}</DialogTitle>
            <DialogDescription className="text-sm text-slate-400 mt-2">{currentSlide.description}</DialogDescription>
            {currentSlide.content}
          </DialogHeader>
          <DialogFooter className="mt-4 flex items-center justify-between">
            <Button variant="ghost" onClick={completeGuide} className="text-slate-500 hover:text-slate-300">Skip</Button>
            {guideStep < guideSlides.length - 1 ? (
              <Button onClick={() => setGuideStep(guideStep + 1)} className="bg-cyan-500 text-slate-950 font-semibold">Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
            ) : (
              <Button onClick={completeGuide} className="bg-cyan-500 text-slate-950 font-semibold">Get Started <Sparkles className="ml-2 h-4 w-4" /></Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secrets Modal */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md border-slate-700 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold"><Lock className="h-5 w-5 text-emerald-400" /> Webhook Signing Secrets</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">Configure your Shopify HMAC secret or Stripe webhook endpoint secret (`whsec_...`).</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveSecrets} className="space-y-4 mt-3">
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Shopify Secret</Label>
              <Input type="password" placeholder="shpss_..." value={shopifySecretInput} onChange={(e) => setShopifySecretInput(e.target.value)} className="bg-slate-900 border-slate-800 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Stripe Secret</Label>
              <Input type="password" placeholder="whsec_..." value={stripeSecretInput} onChange={(e) => setStripeSecretInput(e.target.value)} className="bg-slate-900 border-slate-800 text-white" />
            </div>
            <DialogFooter className="pt-3">
              <Button type="button" variant="ghost" onClick={() => setShowSettings(false)} className="text-slate-400">Cancel</Button>
              <Button type="submit" disabled={updateConfigMutation.isPending} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold">Save Secrets</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Destination Modal */}
      <Dialog open={showDestinationModal} onOpenChange={setShowDestinationModal}>
        <DialogContent className="max-w-md border-slate-700 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold"><Globe className="h-5 w-5 text-cyan-400" /> Add Delivery Destination</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">Register downstream worker URLs to receive replayed or fanned-out webhook events.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveDestination} className="space-y-4 mt-3">
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Destination Name</Label>
              <Input placeholder="Staging Microservice / Worker" value={destNameInput} onChange={(e) => setDestNameInput(e.target.value)} className="bg-slate-900 border-slate-800 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Target URL</Label>
              <Input placeholder="https://api.yourcompany.com/webhooks" value={destUrlInput} onChange={(e) => setDestUrlInput(e.target.value)} className="bg-slate-900 border-slate-800 text-white" />
            </div>
            <DialogFooter className="pt-3">
              <Button type="button" variant="ghost" onClick={() => setShowDestinationModal(false)} className="text-slate-400">Cancel</Button>
              <Button type="submit" disabled={upsertDestinationMutation.isPending} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold">Save Destination</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="brand-mark bg-emerald-500/15 border border-emerald-500/30 p-2.5 rounded-xl text-emerald-400"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-lg font-bold tracking-tight text-white">OmniMesh</h1><Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">AUTONOMOUS ROLLOUT</Badge></div>
            <p className="text-xs text-slate-400">Workspace: {config?.workspaceName ?? "Default Workspace"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={() => setShowSettings(true)} className="border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800">
            <Lock className="h-3.5 w-3.5 mr-1.5 text-emerald-400" /> {signatureVerified ? "Secrets Configured" : "Configure Secrets"}
          </Button>
          <button onClick={() => { setGuideStep(0); setShowGuide(true); }} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-2 bg-slate-900/60 rounded-lg border border-slate-800"><HelpCircle className="h-4 w-4" /> <span className="hidden sm:inline">Guide</span></button>
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full"><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Autonomous agents active</div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 sm:px-8 space-y-8">
        <section className="rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/40 border border-slate-800 p-8 sm:p-12 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> End-to-End Retry & Destination Routing Active
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">Autonomous delivery.<br /><span className="text-emerald-400">Zero lost payloads.</span></h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              OmniMesh runs self-managing ingestion, signature validation, duplicate deduplication, and automated retries across all registered delivery endpoints.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button onClick={runTest} disabled={simulating} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-6 py-2.5 rounded-xl">
                {simulating ? <RefreshCw className="animate-spin mr-2" /> : <Zap className="mr-2" />}
                {simulating ? "Testing..." : "Run test event"}
              </Button>
              <Button variant="outline" onClick={() => setShowDestinationModal(true)} className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800">
                <Globe className="mr-2 h-4 w-4 text-cyan-400" /> Add delivery destination
              </Button>
            </div>
          </div>
          <div className="relative w-64 h-64 flex items-center justify-center border border-slate-800 rounded-full bg-slate-950/60 shadow-inner">
            <div className="absolute inset-4 rounded-full border border-emerald-500/20 animate-spin" style={{ animationDuration: '25s' }} />
            <div className="absolute inset-10 rounded-full border border-cyan-500/20 animate-spin" style={{ animationDuration: '18s', animationDirection: 'reverse' }} />
            <div className="text-center relative z-10 space-y-1">
              <ShieldCheck className="h-8 w-8 text-emerald-400 mx-auto" />
              <strong className="block text-white font-bold text-lg">Autonomous Core</strong>
              <span className="text-xs text-slate-400">{metrics.totalEvents} recorded events</span>
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <article className="bg-slate-900/75 border border-slate-800 p-6 rounded-2xl flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><Activity className="h-6 w-6" /></div>
            <div><span>Events recorded</span><strong className="block text-2xl font-bold text-white mt-0.5">{metrics.totalEvents.toLocaleString()}</strong><small className="text-xs text-slate-500">Across connected endpoints</small></div>
          </article>
          <article className="bg-slate-900/75 border border-slate-800 p-6 rounded-2xl flex items-center gap-4">
            <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"><Sparkles className="h-6 w-6" /></div>
            <div><span>Recovery actions</span><strong className="block text-2xl font-bold text-white mt-0.5">{metrics.healedEvents.toLocaleString()}</strong><small className="text-xs text-slate-500">{recoveredRate}% repaired or deduplicated</small></div>
          </article>
          <article className="bg-slate-900/75 border border-slate-800 p-6 rounded-2xl flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/20"><Gauge className="h-6 w-6" /></div>
            <div><span>Active destinations</span><strong className="block text-2xl font-bold text-white mt-0.5">{destinations.length} endpoints</strong><small className="text-xs text-slate-500">Configured workers</small></div>
          </article>
        </section>

        {/* Workspace Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-slate-800 bg-slate-900/75">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base text-white"><Terminal className="h-4 w-4 text-emerald-400" /> Connect webhook endpoints</CardTitle><CardDescription className="text-slate-400">Paste these URLs into Shopify or Stripe.</CardDescription></CardHeader>
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
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/75">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base text-white"><Globe className="h-4 w-4 text-cyan-400" /> Registered Delivery Destinations</CardTitle><CardDescription className="text-slate-400">Endpoints receiving replayed or fanned-out webhook payloads.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {destinations.length ? destinations.map((dest: any) => (
                <div key={dest.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div>
                    <strong className="text-sm text-white block">{dest.name}</strong>
                    <code className="text-[11px] text-slate-400 font-mono">{dest.targetUrl}</code>
                  </div>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">ACTIVE</Badge>
                </div>
              )) : (
                <p className="text-xs text-slate-500">No custom destinations registered. Click 'Add delivery destination' to connect a worker.</p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Flight Recorder Section */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">FLIGHT RECORDER</span>
              <h3 className="text-xl font-bold text-white mt-0.5">Event history & destination replay.</h3>
              <p className="text-xs text-slate-400 mt-1">Review captured payloads and trigger safe replays across active worker destinations.</p>
            </div>
            <Button onClick={runTest} disabled={simulating} variant="outline" className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800">
              {simulating ? <RefreshCw className="animate-spin mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />} Run test event
            </Button>
          </div>

          <Card className="border-slate-800 bg-slate-900/75 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-950/60">
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-400">EVENT</TableHead>
                  <TableHead className="text-slate-400">PROVIDER</TableHead>
                  <TableHead className="text-slate-400">DELIVERY</TableHead>
                  <TableHead className="text-slate-400">SIGNATURE</TableHead>
                  <TableHead className="text-slate-400">DETAIL</TableHead>
                  <TableHead className="text-right text-slate-400">DISPATCH</TableHead>
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
                        {replayingId === event.id ? <RefreshCw className="animate-spin mr-1.5 h-3 w-3" /> : <RotateCcw className="mr-1.5 h-3 w-3 text-cyan-400" />} {replayingId === event.id ? "Dispatching" : "Replay"}
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={6} className="h-36 text-center text-sm text-slate-500">No events recorded yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </section>
      </main>
    </div>
  );
}
