import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import { Ban, BadgeCheck, MessageSquareLock } from "lucide-react";
import {
  getPrivacySettings,
  toggleBlockAccount,
  updatePrivacySettings,
} from "@/lib/messaging.functions";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notifications-store";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "everyone", label: "Everyone", hint: "Any member can start a chat." },
  { value: "followers", label: "People you follow", hint: "Only accounts you follow." },
  { value: "nobody", label: "No one", hint: "Chats stay closed." },
] as const;

export function PrivacySettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getPrivacySettings);
  const saveSettings = useServerFn(updatePrivacySettings);
  const unblock = useServerFn(toggleBlockAccount);

  const { data, isLoading } = useQuery({
    queryKey: ["privacy-settings", user?.uid ?? null],
    queryFn: () => fetchSettings(),
    enabled: Boolean(user),
  });

  if (!user) return null;

  async function choose(value: (typeof OPTIONS)[number]["value"]) {
    try {
      await saveSettings({ data: { who_can_message: value } });
      await queryClient.invalidateQueries({ queryKey: ["privacy-settings"] });
      notify.success("Message privacy updated");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not save that");
    }
  }

  return (
    <section className="animate-fade space-y-1">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Privacy & messages
      </h2>
      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
            <MessageSquareLock className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium">Who can message you</p>
            <p className="text-xs text-muted-foreground">
              The Candid team can always reach you with important account updates.
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {OPTIONS.map((option) => {
            const active = (data?.who_can_message ?? "everyone") === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={isLoading}
                onClick={() => void choose(option.value)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all duration-300 hover:-translate-y-0.5",
                  active
                    ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
                    : "border-border bg-background hover:bg-secondary",
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {option.label}
                  {active ? <BadgeCheck className="size-3.5 text-primary" /> : null}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{option.hint}</span>
              </button>
            );
          })}
        </div>

        <div>
          <p className="text-sm font-medium">Blocked accounts</p>
          <AnimatePresence initial={false}>
            {data?.blocked?.length ? (
              <ul className="mt-2 space-y-2">
                {data.blocked.map((account) => (
                  <motion.li
                    key={account.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
                  >
                    <span className="flex items-center gap-1.5 text-sm">
                      <Ban className="size-3.5 text-muted-foreground" /> @{account.username}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void (async () => {
                          await unblock({ data: { user_id: account.id } });
                          await queryClient.invalidateQueries({ queryKey: ["privacy-settings"] });
                          notify.success(`Unblocked @${account.username}`);
                        })()
                      }
                    >
                      Unblock
                    </Button>
                  </motion.li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                You have not blocked anyone. Blocked accounts cannot message you.
              </p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
