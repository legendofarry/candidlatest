import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  Ban,
  BadgeCheck,
  ChevronRight,
  Globe2,
  LockKeyhole,
  MessageSquareLock,
  UserRoundCheck,
} from "lucide-react";
import {
  getFollowRequests,
  getPrivacySettings,
  respondToFollowRequest,
  toggleBlockAccount,
  updatePrivacySettings,
} from "@/lib/messaging.functions";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notifications-store";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "followers", label: "People you follow" },
  { value: "nobody", label: "No one" },
] as const;

const VISIBILITY = [
  { value: "public", label: "Public", detail: "Anyone can see your contributions.", Icon: Globe2 },
  {
    value: "private",
    label: "Private",
    detail: "Approve followers before they see your contributions.",
    Icon: LockKeyhole,
  },
] as const;

export function PrivacySettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getPrivacySettings);
  const saveSettings = useServerFn(updatePrivacySettings);
  const unblock = useServerFn(toggleBlockAccount);
  const getRequests = useServerFn(getFollowRequests);
  const respond = useServerFn(respondToFollowRequest);
  const [mobilePanel, setMobilePanel] = useState<"privacy" | "blocked" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["privacy-settings", user?.uid ?? null],
    queryFn: () => fetchSettings(),
    enabled: Boolean(user),
  });
  const { data: requestsData, refetch: refetchRequests } = useQuery({
    queryKey: ["profile-follow-requests", user?.uid ?? null],
    queryFn: () => getRequests(),
    enabled: Boolean(user),
  });

  if (!user) return null;

  async function handleUnblock(userId: string) {
    try {
      await unblock({ data: { user_id: userId } });
      await queryClient.invalidateQueries({ queryKey: ["privacy-settings"] });
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not unblock this account.");
    }
  }

  async function choose(value: (typeof OPTIONS)[number]["value"]) {
    try {
      await saveSettings({ data: { who_can_message: value } });
      await queryClient.invalidateQueries({ queryKey: ["privacy-settings"] });
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not save that");
    }
  }

  async function chooseVisibility(value: (typeof VISIBILITY)[number]["value"]) {
    try {
      await saveSettings({ data: { profile_visibility: value } });
      await queryClient.invalidateQueries({ queryKey: ["privacy-settings"] });
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not update profile visibility.");
    }
  }

  async function handleFollowRequest(followId: string, approve: boolean) {
    try {
      await respond({ data: { follow_id: followId, approve } });
      await Promise.all([
        refetchRequests(),
        queryClient.invalidateQueries({ queryKey: ["public-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["follow-stats"] }),
      ]);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not update that request.");
    }
  }

  const blockedAccounts = (
    <AnimatePresence initial={false}>
      {isLoading ? (
        <p className="mt-2 px-2 py-3 text-sm text-muted-foreground">Loading blocked accounts…</p>
      ) : data?.blocked?.length ? (
        <ul className="mt-2 space-y-2">
          {data.blocked.map((account) => (
            <motion.li
              key={account.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center justify-between border-b border-border px-2 py-2 md:rounded-xl md:border md:px-3"
            >
              <span className="flex items-center gap-1.5 text-sm">
                <Ban className="size-3.5 text-muted-foreground" />
                <Link
                  to="/u/$username"
                  params={{ username: account.username }}
                  className="hover:text-primary"
                >
                  @{account.username}
                </Link>
              </span>
              <Button size="sm" variant="ghost" onClick={() => void handleUnblock(account.id)}>
                Unblock
              </Button>
            </motion.li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          You haven’t blocked anyone.
        </p>
      )}
    </AnimatePresence>
  );

  const settingsContent = (
    <div className="space-y-4 border-y border-border bg-transparent py-4 md:rounded-2xl md:border md:bg-card md:p-4">
      <div>
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
            {data?.profile_visibility === "private" ? (
              <LockKeyhole className="size-4" />
            ) : (
              <Globe2 className="size-4" />
            )}
          </span>
          <div>
            <p className="text-sm font-medium">Profile visibility</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your handle, photo and cover remain visible either way.
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {VISIBILITY.map(({ value, label, detail, Icon }) => {
            const active = (data?.profile_visibility ?? "public") === value;
            return (
              <button
                key={value}
                type="button"
                disabled={isLoading}
                onClick={() => void chooseVisibility(value)}
                className={cn(
                  "flex min-h-16 items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                  active ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/60",
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {label}
                    {active ? <BadgeCheck className="size-3.5 text-primary" /> : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <MessageSquareLock className="size-4" />
        </span>
        <p className="text-sm font-medium">Who can message you</p>
      </div>

      {(requestsData?.requests.length ?? 0) > 0 ? (
        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <UserRoundCheck className="size-4 text-primary" />
            <p className="text-sm font-medium">Follow requests</p>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {requestsData!.requests.length}
            </span>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {requestsData!.requests.map((request) => (
              <li key={request.id} className="flex items-center gap-3 py-3">
                <Link
                  to="/u/$username"
                  params={{ username: request.username }}
                  className="flex min-w-0 flex-1 items-center gap-2 hover:text-primary"
                >
                  <span className="truncate text-sm font-medium">@{request.username}</span>
                </Link>
                <Button size="sm" onClick={() => void handleFollowRequest(request.id, true)}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleFollowRequest(request.id, false)}
                >
                  Decline
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-0 md:grid-cols-3 md:gap-2">
        {OPTIONS.map((option) => {
          const active = (data?.who_can_message ?? "everyone") === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={isLoading}
              onClick={() => void choose(option.value)}
              className={cn(
                "rounded-none border-0 border-b border-l-2 border-l-transparent px-2 py-3 text-left transition-colors md:rounded-xl md:border md:p-3 md:transition-all md:duration-300 md:hover:-translate-y-0.5",
                active
                  ? "border-l-primary bg-primary/5 md:border-primary md:bg-primary/10 md:shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
                  : "bg-transparent hover:bg-secondary md:border-border md:bg-background",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {option.label}
                {active ? <BadgeCheck className="size-3.5 text-primary" /> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div>
        <p className="text-sm font-medium">Blocked accounts</p>
        {blockedAccounts}
      </div>
    </div>
  );

  return (
    <section className="animate-fade space-y-1">
      <div className="space-y-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobilePanel("privacy")}
          className="flex w-full items-center gap-3 border-y border-border py-4 text-left"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
            <LockKeyhole className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Privacy & messages</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Profile visibility and who can contact you
            </span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel("blocked")}
          className="flex w-full items-center gap-3 border-b border-border py-4 text-left"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
            <Ban className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Blocked accounts</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {data?.blocked?.length ? `${data.blocked.length} blocked` : "Manage blocked accounts"}
            </span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      </div>
      <div className="hidden md:block">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Privacy & messages
        </h2>
        {settingsContent}
      </div>
      <Drawer open={mobilePanel !== null} onOpenChange={(open) => !open && setMobilePanel(null)}>
        <DrawerContent className="h-[85dvh] max-h-[85dvh] rounded-t-3xl md:hidden">
          <DrawerHeader className="shrink-0 text-left">
            <DrawerTitle>
              {mobilePanel === "blocked" ? "Blocked accounts" : "Privacy & messages"}
            </DrawerTitle>
            <DrawerDescription>
              {mobilePanel === "blocked"
                ? "Accounts you block cannot contact you or appear in your suggestions."
                : "Choose who can see your profile and message you."}
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
            {mobilePanel === "blocked" ? blockedAccounts : settingsContent}
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
