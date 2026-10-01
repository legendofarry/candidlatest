import { useEffect, useState } from "react";
import { Archive, Database, Download, LoaderCircle, RotateCcw, Trash2, Upload } from "lucide-react";
import type { User } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { firebaseApp } from "@/integrations/firebase/client";

type Props = { user: User | null };

export function DevDatabaseTools({ user }: Props) {
  const [projectId, setProjectId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupReady, setBackupReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"backup" | "clear" | "restore" | null>(null);

  async function requestHeaders() {
    if (!user) throw new Error("Sign in with the allowlisted development account.");
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  }

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    void user
      .getIdToken()
      .then((token) => ({ Authorization: `Bearer ${token}` }))
      .then((headers) => fetch("/api/dev/database", { headers }))
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          projectId?: string;
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error ?? "Development database tools are unavailable.");
        if (!cancelled) setProjectId(payload.projectId ?? "");
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "Could not load database tools.");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function createBackup() {
    setBusy("backup");
    setError(null);
    setNotice(null);
    setBackupReady(false);
    setConfirmation("");
    try {
      const response = await fetch("/api/dev/database/backup", { headers: await requestHeaders() });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not create the backup.");
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error("The database returned an empty backup.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        "candid-firestore-backup.zip";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setBackupReady(true);
      setNotice(
        "Backup ZIP created and download started. Confirm the project ID below to clear Firestore.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the backup.");
    } finally {
      setBusy(null);
    }
  }

  async function clearData() {
    setBusy("clear");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dev/database/clear", {
        method: "POST",
        headers: { ...(await requestHeaders()), "content-type": "application/json" },
        body: JSON.stringify({ confirmation, backupDownloaded: true }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        clearedCollections?: string[];
      };
      if (!response.ok) throw new Error(payload.error ?? "Could not clear Firestore.");
      setBackupReady(false);
      setConfirmation("");
      setNotice(`Firestore cleared (${payload.clearedCollections?.length ?? 0} collections).`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not clear Firestore.");
    } finally {
      setBusy(null);
    }
  }

  async function restoreData() {
    if (!backupFile) return;
    setBusy("restore");
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("backup", backupFile);
      form.set("confirmation", restoreConfirmation);
      const response = await fetch("/api/dev/database/restore", {
        method: "POST",
        headers: await requestHeaders(),
        body: form,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        restoredDocuments?: number;
      };
      if (!response.ok) throw new Error(payload.error ?? "Could not restore the backup.");
      setNotice(`Restored ${payload.restoredDocuments ?? 0} documents from ${backupFile.name}.`);
      setBackupFile(null);
      setRestoreConfirmation("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not restore the backup.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-destructive/40 bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
          <Database className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Development database</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Export or clear Firestore, including nested collections. Firebase Authentication
            accounts are not changed.
          </p>
          <p className="mt-2 font-mono text-xs">
            Firebase client project: {firebaseApp.options.projectId}
          </p>
          {projectId ? (
            <p className="mt-1 font-mono text-xs">Allowed project: {projectId}</p>
          ) : null}
          {user ? (
            <p className="mt-1 font-mono text-xs">Signed-in account UID: {user.uid}</p>
          ) : null}
        </div>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        Configure DEV_DATABASE_TOOLS_ENABLED=true, DEV_DATABASE_PROJECT_ID and
        DEV_DATABASE_ADMIN_UID in .env.local, then restart the dev server.
      </p>

      {!user ? (
        <p className="text-sm text-muted-foreground">Sign in to use these controls.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-verified">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!user || !projectId || Boolean(busy)}
          onClick={() => void createBackup()}
        >
          {busy === "backup" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Create backup ZIP
        </Button>
      </div>

      {backupReady ? (
        <div className="space-y-2 border-t border-border pt-4">
          <label htmlFor="clear-confirm" className="text-xs font-medium">
            Type {projectId || "the project ID"} to permanently clear its Firestore data
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="clear-confirm"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="destructive"
              disabled={!projectId || confirmation !== projectId || Boolean(busy)}
              onClick={() => void clearData()}
            >
              {busy === "clear" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Clear Firestore
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Archive className="size-4 text-muted-foreground" /> Restore from backup ZIP
        </div>
        <Input
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)}
          disabled={Boolean(busy)}
        />
        {backupFile ? (
          <>
            <p className="text-xs text-muted-foreground">
              Existing documents at matching paths will be overwritten; other documents remain.
            </p>
            <label htmlFor="restore-confirm" className="text-xs font-medium">
              Type {projectId || "the project ID"} to restore this archive
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="restore-confirm"
                value={restoreConfirmation}
                onChange={(event) => setRestoreConfirmation(event.target.value)}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!projectId || restoreConfirmation !== projectId || Boolean(busy)}
                onClick={() => void restoreData()}
              >
                {busy === "restore" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Restore ZIP
              </Button>
            </div>
          </>
        ) : null}
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <RotateCcw className="mt-0.5 size-3.5 shrink-0" />
          Restore writes backed-up records but does not clear unrelated documents. Clear first for
          an exact restore.
        </p>
      </div>
    </section>
  );
}
