import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, MessagesSquare, Sparkles, Trash2 } from "lucide-react";
import { getConversations } from "@/lib/messaging.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  clearDemoConversation,
  seedDemoConversation,
  useDemoConversation,
} from "@/lib/demo-messaging";

export const Route = createFileRoute("/messages/")({
  head: () => ({
    meta: [
      { title: "Your messages | Candid" },
      {
        name: "description",
        content:
          "Private conversations on Candid — chat with other members and the Candid team, with full control over who can reach you.",
      },
      { property: "og:title", content: "Your messages | Candid" },
      {
        property: "og:description",
        content: "Private conversations on Candid, with full control over who can reach you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MessagesInbox,
});

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function MessagesInbox({
  onSelectConversation,
}: {
  onSelectConversation?: (conversationId: string) => void;
} = {}) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchConversations = useServerFn(getConversations);
  const demo = useDemoConversation();

  const { data, isLoading } = useQuery({
    queryKey: ["conversations", user?.uid],
    queryFn: () => fetchConversations(),
    enabled: Boolean(user),
    refetchInterval: 15000,
  });

  const conversations = [
    ...(demo
      ? [
          {
            id: demo.id,
            with: demo.with,
            last_message: demo.last_message,
            last_message_at: demo.last_message_at,
            unread: demo.unread,
            mine: demo.mine,
            demo: true,
          },
        ]
      : []),
    ...(data ?? []).map((item) => ({ ...item, demo: false })),
  ].sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Private one-to-one chats. Candid can always reach you with important updates.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {demo ? (
            <Button variant="outline" size="sm" onClick={clearDemoConversation}>
              <Trash2 className="size-4" /> Clear demo chat
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={seedDemoConversation}>
              <Sparkles className="size-4" /> Load demo chat
            </Button>
          )}
          {!user && !loading ? (
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/auth" })}>
              Sign in for private messages
            </Button>
          ) : null}
        </div>
      </header>

      {isLoading && !demo ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-20 animate-pulse rounded-2xl bg-secondary/60" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-3xl p-10 text-center"
        >
          <Sparkles className="mx-auto size-8 text-primary" />
          <p className="mt-4 font-medium">No conversations yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open someone&apos;s profile and tap Message to start a chat.
          </p>
        </motion.div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {conversations.map((item, index) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: { delay: index * 0.03 } }}
                exit={{ opacity: 0 }}
              >
                <button
                  type="button"
                  onClick={() =>
                    onSelectConversation
                      ? onSelectConversation(item.id)
                      : void navigate({ to: "/messages/$id", params: { id: item.id } })
                  }
                  className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/5 font-display text-base font-semibold uppercase">
                    {item.with?.username?.slice(0, 2) ?? "??"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">@{item.with?.username}</span>
                      {item.with?.verified ? (
                        <BadgeCheck className="size-4 shrink-0 text-primary" />
                      ) : null}
                      {item.demo ? (
                        <span className="rounded border border-primary/30 px-1 py-0.5 text-[9px] font-semibold uppercase text-primary">
                          Demo
                        </span>
                      ) : null}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {timeAgo(item.last_message_at)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block truncate text-sm text-muted-foreground",
                        item.unread > 0 && "font-medium text-foreground",
                      )}
                    >
                      {item.mine ? "You: " : ""}
                      {item.last_message || "Say hello"}
                    </span>
                  </span>
                  {item.unread > 0 ? (
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      {item.unread > 9 ? "9+" : item.unread}
                    </span>
                  ) : null}
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
