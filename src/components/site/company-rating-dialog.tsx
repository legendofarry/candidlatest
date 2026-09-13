import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { notify as toast } from "@/lib/notifications-store";
import { rateCompanyFromQuestionnaire } from "@/lib/company.functions";
import { cn } from "@/lib/utils";

const METRICS = [
  { key: "pay_on_time", label: "Were you paid in full and on time?" },
  { key: "compliance", label: "Was your contract and statutory paperwork in order?" },
  { key: "respect", label: "How were people treated day to day?" },
  { key: "workload", label: "How reasonable was the workload?" },
  { key: "growth", label: "How much room was there to grow?" },
] as const;

const SCALE = [
  { value: 1, label: "Terrible" },
  { value: 2, label: "Poor" },
  { value: 3, label: "Mixed" },
  { value: 4, label: "Good" },
  { value: 5, label: "Excellent" },
];

const REASONS = [
  "Paid on time, every time",
  "Salary delays",
  "Statutory deductions handled",
  "No contract or missing NSSF/SHIF/PAYE",
  "Managers treat people with respect",
  "Bullying or harassment",
  "Workload is sustainable",
  "Constant unpaid overtime",
  "Real training and promotion",
  "No growth path",
  "Tribalism or nepotism",
  "Clean, fair exit process",
];

type MetricKey = (typeof METRICS)[number]["key"];

export function CompanyRatingDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
  initial,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  companyId: string;
  companyName: string;
  initial?: { metrics: Partial<Record<MetricKey, number>>; reasons: string[] } | null;
}) {
  const submit = useServerFn(rateCompanyFromQuestionnaire);
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<Partial<Record<MetricKey, number>>>(
    initial?.metrics ?? {},
  );
  const [reasons, setReasons] = useState<string[]>(initial?.reasons ?? []);
  const [wouldWork, setWouldWork] = useState<boolean | null>(null);

  const totalSteps = METRICS.length + 2;
  const metric = METRICS[step];

  function pick(key: MetricKey, value: number) {
    setMetrics((current) => ({ ...current, [key]: value }));
    setStep((current) => current + 1);
  }

  function toggleReason(reason: string) {
    setReasons((current) =>
      current.includes(reason) ? current.filter((r) => r !== reason) : [...current, reason],
    );
  }

  async function finish() {
    if (wouldWork === null) return;
    setBusy(true);
    try {
      await submit({
        data: {
          company_id: companyId,
          metrics: {
            pay_on_time: metrics.pay_on_time ?? 3,
            compliance: metrics.compliance ?? 3,
            respect: metrics.respect ?? 3,
            workload: metrics.workload ?? 3,
            growth: metrics.growth ?? 3,
          },
          would_work_here: wouldWork,
          reasons,
        },
      });
      toast.success("Thanks — your rating is counted.");
      await queryClient.invalidateQueries({ queryKey: ["company"] });
      await queryClient.invalidateQueries({ queryKey: ["company-intel", companyId] });
      onOpenChange(false);
      setStep(0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your rating");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="size-4 text-primary" /> Rate {companyName}
          </DialogTitle>
          <DialogDescription>
            Tap your answers — nothing to type. Step {Math.min(step + 1, totalSteps)} of{" "}
            {totalSteps}.
          </DialogDescription>
        </DialogHeader>

        <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {metric ? (
          <div className="space-y-3">
            <p className="font-medium">{metric.label}</p>
            <div className="grid gap-2">
              {SCALE.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={metrics[metric.key] === option.value ? "default" : "outline"}
                  className="justify-between"
                  onClick={() => pick(metric.key, option.value)}
                >
                  <span>{option.label}</span>
                  <span className="text-xs opacity-70">{option.value}/5</span>
                </Button>
              ))}
            </div>
          </div>
        ) : step === METRICS.length ? (
          <div className="space-y-3">
            <p className="font-medium">What stood out? Tap all that apply.</p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((reason) => {
                const active = reasons.includes(reason);
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => toggleReason(reason)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    {active ? <Check className="mr-1 inline size-3" /> : null}
                    {reason}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(step + 1)}>
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="font-medium">Would you work here again?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={wouldWork === true ? "default" : "outline"}
                onClick={() => setWouldWork(true)}
              >
                Yes
              </Button>
              <Button
                variant={wouldWork === false ? "default" : "outline"}
                onClick={() => setWouldWork(false)}
              >
                No
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                Back
              </Button>
              <Button
                className="flex-1 glow-primary"
                disabled={wouldWork === null || busy}
                onClick={() => void finish()}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null} Submit rating
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
