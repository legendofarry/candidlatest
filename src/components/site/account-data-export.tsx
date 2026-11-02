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
      notify.error(error instanceof Error ? error.message : "Could not prepare your account export.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="flex flex-col gap-3 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between">
    <div><p className="text-sm font-medium">Download your account data</p><p className="mt-1 text-xs text-muted-foreground">Get a JSON copy of your profile, contributions, activity and messages. Other members’ private details and employment evidence are excluded.</p></div>
    <Button type="button" variant="outline" disabled={loading} onClick={() => void download()} className="shrink-0">
      {loading ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
      {loading ? "Preparing…" : "Download data"}
    </Button>
  </div>;
}
