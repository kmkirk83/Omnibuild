import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, ArrowRight, BookOpen, Check, CheckCircle2, Copy, Gauge, HelpCircle, Play, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Terminal, Zap } from "lucide-react";
import { toast } from "sonner";

type Provider = "shopify" | "stripe";

export default function Home() {
  const [showGuide, setShowGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [copiedProvider, setCopiedProvider] = useState<Provider | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [verified, setVerified] = useState(false);
  const [replayingId, setReplayingId] = useState<number | null>(null);

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
  const securityQuery = trpc.omnimesh.securityStatus.useQuery(undefined, { refetchInterval: 15000 });

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

  const metrics = metricsQuery.data ?? { totalEvents: 0, healedEvents: 0, activeAgents: 0, driftCorrections: 0, avgLatencyMs: 0 };
  const events = eventsQuery.data ?? [];
  const recoveredRate = metrics.totalEvents ? Math.round((metrics.healedEvents / metrics.totalEvents) * 100) : 0;
  const verificationReady = securityQuery.data?.signatureVerificationEnabled === true;

  const guideSlides = [
    {
      eyebrow: "Connect",
      title: "One endpoint. No infrastructure maze.",
      description: "Copy a provider endpoint, add it in Shopify or Stripe, and OmniMesh records each delivery in one place.",
      content: (
        <div className="guide-connection-map">
          <div className="guide-provider-node">Shopify / Stripe</div>
          <div className="guide-route-line"><span /></div>
          <div className="guide-provider-node active">OmniMesh</div>
        </div>
      ),
    },
    {
      eyebrow: "Test",
      title: "See recovery before a customer ever does.",
      description: "Run a safe simulated drift. OmniMesh creates a recorded delivery and shows exactly what was repaired.",
      content: (
        <div className="guide-test-panel">
          {verified ? (
            <div className="guide-success"><CheckCircle2 /> Test passed. The recovery was recorded.</div>
          ) : (
            <Button onClick={runTest} disabled={simulating} className="guide-primary-button">
              {simulating ? <RefreshCw className="animate-spin" /> : <Play />}
              {simulating ? "Running test..." : "Run safe test"}
            </Button>
          )}
          <span>Nothing is sent to a live customer or provider.</span>
        </div>
      ),
    },
    {
      eyebrow: "Protect",
      title: "A flight recorder for every delivery.",
      description: "OmniMesh stores a redacted event snapshot, captures its delivery state, and lets you create a safe local replay when debugging.",
      content: (
        <div className="guide-protect-panel">
          <ShieldCheck />
          <div><strong>Redacted capture enabled</strong><span>Events, recovery notes, and local replays stay visible in the Flight Recorder.</span></div>
        </div>
      ),
    },
  ];
  const currentSlide = guideSlides[guideStep];

  return (
    <div className="omni-shell min-h-screen text-slate-100">
      <div className="omni-grid" aria-hidden="true" />

      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="omni-dialog max-w-xl border-slate-700 bg-slate-950 text-white">
          <div className="omni-dialog-glow" aria-hidden="true" />
          <DialogHeader className="relative z-10">
            <div className="flex items-center justify-between gap-3">
              <div className="guide-eyebrow"><BookOpen /> <span>{currentSlide.eyebrow}</span></div>
              <div className="guide-progress" aria-label={`Tutorial step ${guideStep + 1} of 3`}>
                {guideSlides.map((_, index) => <span key={index} className={index <= guideStep ? "active" : ""} />)}
              </div>
            </div>
            <div key={guideStep} className="guide-slide-enter mt-7">
              <DialogTitle className="text-3xl leading-tight tracking-tight">{currentSlide.title}</DialogTitle>
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
              <Button onClick={() => setGuideStep(guideStep + 1)} className="omni-primary-button">
                Continue <ArrowRight />
              </Button>
            ) : (
              <Button onClick={completeGuide} className="omni-primary-button">
                Open workspace <Sparkles />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="brand-mark"><ShieldCheck /></div>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-lg font-semibold tracking-tight">OmniMesh</h1><span className="brand-badge">RELIABILITY</span></div>
            <p className="text-xs text-slate-500">Webhook delivery, recovery, and replay.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setGuideStep(0); setShowGuide(true); }} className="tutorial-trigger"><HelpCircle /> <span className="hidden sm:inline">How it works</span></button>
          <div className="live-chip"><span /> Capture ready</div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 sm:px-8">
        <section className="hero-panel omni-fade-up">
          <div className="hero-copy">
            <span className="hero-eyebrow"><span /> Webhook reliability layer</span>
            <h2>Know every event.<br /><span>Recover without guessing.</span></h2>
            <p>Capture incoming provider events, see their delivery state, and create safe local replays from a redacted Flight Recorder.</p>
            <div className="hero-actions">
              <Button onClick={runTest} disabled={simulating} className="omni-primary-button">
                {simulating ? <RefreshCw className="animate-spin" /> : <Zap />}
                {simulating ? "Testing..." : "Run reliability test"}
              </Button>
              <button onClick={() => { setGuideStep(0); setShowGuide(true); }} className="text-link">Take the 3-step guide <ArrowRight /></button>
            </div>
          </div>
          <div className="health-orbit" aria-label="Current webhook health">
            <div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-dot dot-one" /><div className="orbit-dot dot-two" />
            <div className="health-core"><ShieldCheck /><strong>Healthy</strong><span>{metrics.totalEvents} recorded events</span></div>
          </div>
        </section>

        <section className="stats-grid omni-fade-up delay-1">
          <article className="stat-card"><div className="stat-icon emerald"><Activity /></div><div><span>Events recorded</span><strong>{metrics.totalEvents.toLocaleString()}</strong><small>Across your connected endpoints</small></div></article>
          <article className="stat-card"><div className="stat-icon cyan"><Sparkles /></div><div><span>Recovery actions</span><strong>{metrics.healedEvents.toLocaleString()}</strong><small>{recoveredRate}% of logged events repaired</small></div></article>
          <article className="stat-card"><div className="stat-icon violet"><Gauge /></div><div><span>Average intake</span><strong>{metrics.avgLatencyMs.toFixed(1)}ms</strong><small>Accepted into your Flight Recorder</small></div></article>
        </section>

        <section className="workspace-grid omni-fade-up delay-2">
          <Card className="endpoint-card border-slate-800 bg-slate-900/75">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Terminal className="h-4 w-4 text-emerald-400" /> Connect endpoints</CardTitle><CardDescription>Paste these URLs into your Shopify or Stripe webhook settings.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {(["shopify", "stripe"] as Provider[]).map((provider) => (
                <div key={provider} className={`endpoint-row ${provider}`}>
                  <div><span className="endpoint-label">{provider === "shopify" ? "Shopify" : "Stripe"}</span><code>{endpointUrls[provider]}</code></div>
                  <Button size="sm" variant="ghost" onClick={() => copyEndpoint(provider)} className="copy-action">
                    {copiedProvider === provider ? <Check /> : <Copy />}<span>{copiedProvider === provider ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
              ))}
              <p className="endpoint-note"><ShieldCheck /> Sensitive fields are redacted before events enter the Flight Recorder.</p>
            </CardContent>
          </Card>

          <Card className="protect-card border-slate-800 bg-slate-900/75">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-cyan-300" /> Protection status</CardTitle><CardDescription>Your first-response checklist, always visible.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="protect-row"><span className="status-check"><Check /></span><div><strong>Event capture</strong><small>Shopify and Stripe capture routes are active.</small></div><Badge>ONLINE</Badge></div>
              <div className="protect-row"><span className="status-check"><Check /></span><div><strong>Redacted Flight Recorder</strong><small>Sensitive payload fields are masked on capture.</small></div><Badge>READY</Badge></div>
              <div className="protect-row"><span className={verified ? "status-check" : "status-idle"}>{verified ? <Check /> : "3"}</span><div><strong>Recovery test</strong><small>{verified ? "Safe drift test completed successfully." : "Run a test to confirm your recovery path."}</small></div><Badge className={verified ? "badge-success" : "badge-muted"}>{verified ? "PASSED" : "PENDING"}</Badge></div>
              <div className="protect-row"><span className={verificationReady ? "status-check" : "status-idle"}>{verificationReady ? <Check /> : "4"}</span><div><strong>Production verification</strong><small>{verificationReady ? "Provider signatures are being verified before capture." : "Raw-body capture is ready; secrets and tenant configuration are required before verification."}</small></div><Badge className={verificationReady ? "badge-success" : "badge-muted"}>{verificationReady ? "READY" : "SETUP"}</Badge></div>
            </CardContent>
          </Card>
        </section>

        <section className="flight-section omni-fade-up delay-3">
          <div className="section-heading"><div><span className="section-kicker">FLIGHT RECORDER</span><h3>Event history, with a safe way back.</h3><p>Every captured event is visible here. Create a local replay to debug safely without sending anything to a provider or customer.</p></div><Button onClick={runTest} disabled={simulating} variant="outline" className="test-action">{simulating ? <RefreshCw className="animate-spin" /> : <Play />} Run test event</Button></div>
          <Card className="flight-table-card border-slate-800 bg-slate-900/75">
            <Table>
              <TableHeader><TableRow><TableHead>EVENT</TableHead><TableHead>PROVIDER</TableHead><TableHead>DELIVERY</TableHead><TableHead>DETAIL</TableHead><TableHead className="text-right">RECOVER</TableHead></TableRow></TableHeader>
              <TableBody>
                {events.length ? events.map((event: any) => (
                  <TableRow key={event.id} className="flight-row">
                    <TableCell><div className="event-cell"><span className="event-id">#{event.id}</span><small>{event.eventType || "unknown"}</small></div></TableCell>
                    <TableCell><Badge className={`provider-badge ${event.provider}`}>{event.provider}</Badge></TableCell>
                    <TableCell><span className={`state-pill ${event.deliveryState || "received"}`}><i />{event.deliveryState || "received"}</span></TableCell>
                    <TableCell className="max-w-[280px]"><p className="detail-text">{event.healingDetails || event.lastError || "Captured safely"}</p></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => { setReplayingId(event.id); replayMutation.mutate({ eventId: event.id }); }} disabled={replayingId === event.id} className="replay-action">{replayingId === event.id ? <RefreshCw className="animate-spin" /> : <RotateCcw />} {replayingId === event.id ? "Replaying" : "Replay"}</Button></TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={5} className="h-36 text-center text-sm text-slate-500">No events yet. Copy an endpoint above or run the safe test event.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </section>
      </main>
    </div>
  );
}
