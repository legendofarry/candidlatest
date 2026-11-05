import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notifications-store";
import { downloadAccountExport } from "@/lib/account-export.functions";

export function AccountDataExport() {
  const exportData = useServerFn(downloadAccountExport);
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `candid-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      notify.success("Your account export is ready.");
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not prepare your account export.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3.5 last:border-b-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Download className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Your data</p>
        <p className="text-xs text-muted-foreground">Export a copy</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={loading ? "Preparing account data export" : "Download account data"}
        title={loading ? "Preparing…" : "Download account data"}
        aria-busy={loading}
        disabled={loading}
        onClick={() => void download()}
        className="group size-10 shrink-0 rounded-full border border-border/60 bg-background/70 text-muted-foreground shadow-sm transition-all hover:border-primary/30 hover:bg-primary/10 hover:text-primary active:scale-95"
      >
        {loading ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Download className="size-4 transition-transform duration-200 group-hover:translate-y-0.5 motion-reduce:transition-none" />
        )}
      </Button>
    </div>
  );
}
