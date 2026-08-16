import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight, CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";

export function HealingRuleBuilder() {
  const [ruleName, setRuleName] = useState("");
  const [matchField, setMatchField] = useState("");
  const [transformValue, setTransformValue] = useState("");
  const rulesQuery = trpc.omnimesh.listHealingRules.useQuery();
  const utils = trpc.useUtils();

  const saveRule = trpc.omnimesh.upsertHealingRule.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      setRuleName("");
      setMatchField("");
      setTransformValue("");
      utils.omnimesh.listHealingRules.invalidate();
    },
    onError: () => toast.error("Unable to save this recovery rule."),
  });

  const submitRule = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ruleName.trim() || !matchField.trim()) {
      toast.error("A rule name and payload field are required.");
      return;
    }
    saveRule.mutate({
      ruleName: ruleName.trim(),
      targetProvider: "all",
      matchField: matchField.trim(),
      matchCondition: "missing_or_empty",
      transformAction: "inject_default",
      transformValue: transformValue.trim() || "{}",
    });
  };

  const rules = rulesQuery.data ?? [];

  return (
    <section className="space-y-4">
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">HEALING WORKFLOW BUILDER</span>
        <h3 className="mt-1 text-xl font-bold text-white">Turn recurring payload breaks into deterministic fixes.</h3>
        <p className="mt-1 text-xs text-slate-400">Create a field-match condition and the default value OmniMesh should inject when the condition is met.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-slate-800 bg-slate-900/75">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-white"><Plus className="h-4 w-4 text-emerald-400" /> New recovery rule</CardTitle>
            <CardDescription className="text-slate-400">The builder creates an auditable, deterministic repair policy.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitRule} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-300">Rule name</Label>
                  <Input value={ruleName} onChange={(event) => setRuleName(event.target.value)} placeholder="Repair missing fulfillment status" className="border-slate-800 bg-slate-950 text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-300">Trigger field</Label>
                  <Input value={matchField} onChange={(event) => setMatchField(event.target.value)} placeholder="fulfillment.status" className="border-slate-800 bg-slate-950 font-mono text-white" />
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
                <Badge variant="outline" className="border-amber-500/30 text-amber-400">IF MISSING OR EMPTY</Badge>
                <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">INJECT DEFAULT</Badge>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-300">Default value (JSON)</Label>
                <Input value={transformValue} onChange={(event) => setTransformValue(event.target.value)} placeholder='{"status":"pending"}' className="border-slate-800 bg-slate-950 font-mono text-white" />
              </div>
              <Button type="submit" disabled={saveRule.isPending} className="bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400">
                <Sparkles className="mr-2 h-4 w-4" /> {saveRule.isPending ? "Saving rule..." : "Activate healing rule"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/75">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-white"><CheckCircle2 className="h-4 w-4 text-cyan-400" /> Active rules</CardTitle>
            <CardDescription className="text-slate-400">These policies are visible to operators before a repair occurs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rules.length ? rules.slice(0, 4).map((rule: any) => (
              <div key={rule.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="block text-sm text-white">{rule.ruleName}</strong>
                    <code className="mt-1 block text-[11px] text-cyan-300">{rule.matchField}</code>
                  </div>
                  <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">ACTIVE</Badge>
                </div>
                <p className="mt-2 text-xs text-slate-400">{rule.matchCondition.replaceAll("_", " ")} <span className="text-slate-600">→</span> {rule.transformAction.replaceAll("_", " ")}</p>
              </div>
            )) : <p className="py-8 text-center text-xs text-slate-500">No active healing rules yet.</p>}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
