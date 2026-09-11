import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Flag, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { notify as toast } from "@/lib/notifications-store";
import { submitReport } from "@/lib/actions.functions";
import { cn } from "@/lib/utils";

export const REPORT_REASONS = [
  "Identifies a private individual",
  "Hate speech or harassment",
  "False or misleading claim",
  "Spam or advertising",
  "Sexual or graphic content",
  "Threat of violence",
  "Off topic",
  "Something else",
] as const;

/** Modern reason picker used for both stories and comments. */
export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  onReported,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  targetType: "story" | "comment";
  targetId: string;
  onReported?: () => void;
}) {
  const report = useServerFn(submitReport);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const toggle = (reason: string) =>
    setSelected((prev) =>
      prev.includes(reason) ? prev.filter((item) => item !== reason) : [...prev, reason],
    );

  const submit = async () => {
    if (selected.length === 0) return;
    setPending(true);
    try {
      const result = await report({
        data: { target_type: targetType, target_id: targetId, reasons: selected, detail: null },
      });
      toast.success(
        result?.alreadyReported ? "You already reported this" : "Report sent to moderators",
      );
      onReported?.();
      onOpenChange(false);
      setSelected([]);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-danger/10 text-danger">
              <Flag className="size-4" />
            </span>
            Report this {targetType}
          </DialogTitle>
          <DialogDescription>
            Pick everything that applies. Reports are anonymous and reviewed by moderators.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {REPORT_REASONS.map((reason, index) => {
            const active = selected.includes(reason);
            return (
              <motion.button
                key={reason}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.025 }}
                onClick={() => toggle(reason)}
                className={cn(
                  "flex items-center justify-between rounded-xl border border-border px-3.5 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "border-danger/50 bg-danger/10 text-foreground"
                    : "hover:bg-secondary/60",
                )}
              >
                {reason}
                <span
                  className={cn(
                    "size-4 rounded-full border",
                    active ? "border-danger bg-danger" : "border-muted-foreground/40",
                  )}
                />
              </motion.button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={selected.length === 0 || pending} onClick={() => void submit()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
