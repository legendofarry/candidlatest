import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, BadgeCheck, Search, Sparkles, SquarePen } from "lucide-react";
import { getConversations, startConversationByUsername } from "@/lib/messaging.functions";
import { readInboxScroll, saveInboxScroll } from "@/lib/message-panel-state";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { MembershipBadge } from "@/components/site/membership-badge";
import { useAutoCollapsingCount } from "@/hooks/use-auto-collapsing-count";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/site/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const queryClient = useQueryClient();
  const fetchConversations = useServerFn(getConversations);
  const createConversation = useServerFn(startConversationByUsername);
  const listRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const { visibleCount, expandBy } = useAutoCollapsingCount(20);
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [composeError, setComposeError] = useState("");
  const [startingConversation, setStartingConversation] = useState(false);
  const embedded = Boolean(onSelectConversation);

  const {
    data,
    isLoading,
    isError,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["conversations", user?.uid],
    initialPageParam: null as { lastMessageAt: string; id: string } | null,
    queryFn: ({ pageParam }) => fetchConversations({ data: { limit: 20, cursor: pageParam } }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Restore the previous inbox scroll position once the list has rendered.
  useEffect(() => {
    if (isLoading || restoredRef.current) return;
    restoredRef.current = true;
    const saved = readInboxScroll();
    if (saved <= 0) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const drawer = listRef.current?.closest("[data-messages-scroll]") as HTMLElement | null;
        if (drawer) drawer.scrollTop = saved;
        else window.scrollTo({ top: saved });
      });
    });
  }, [isLoading]);

  // Remember the inbox scroll position so reopening messages resumes where it was.
  useEffect(() => {
    const drawer = listRef.current?.closest("[data-messages-scroll]") as HTMLElement | null;
    const target: HTMLElement | Window = drawer ?? window;
    const handler = () => saveInboxScroll(drawer ? drawer.scrollTop : window.scrollY);
    target.addEventListener("scroll", handler, { passive: true });
    return () => target.removeEventListener("scroll", handler);
  }, []);

  const conversations = data?.pages.flatMap((page) => page.items) ?? [];
  const matchingConversations = useMemo(() => {
    const query = search.trim().replace(/^@/, "").toLowerCase();
    if (!query) return conversations;
    return conversations.filter((item) =>
      `${item.with?.username ?? ""} ${item.last_message ?? ""}`.toLowerCase().includes(query),
    );
  }, [conversations, search]);
  const visibleConversations = matchingConversations.slice(0, visibleCount);

  async function handleStartConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    const cleanUsername = username.trim().replace(/^@/, "");
    if (!cleanUsername) {
      setComposeError("Enter a Candid username to start a chat.");
      return;
    }
    setStartingConversation(true);
    setComposeError("");
    try {
      const result = await createConversation({ data: { username: cleanUsername } });
      setComposeOpen(false);
      setUsername("");
      void queryClient.invalidateQueries({ queryKey: ["conversations", user.uid] });
      void navigate({ to: "/messages/$id", params: { id: result.conversation_id } });
    } catch (error) {
      setComposeError(error instanceof Error ? error.message : "Could not start this conversation.");
    } finally {
      setStartingConversation(false);
    }
  }

  return (
    <div
      ref={listRef}
      className={cn(
        embedded ? "mx-auto max-w-2xl" : "-mx-4 max-w-none md:mx-auto md:max-w-5xl",
      )}
    >
      {!embedded ? (
        <header className="border-b border-border bg-background px-4 pb-5 pt-4 sm:px-6 md:py-6">
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Back to feed"
              className="!size-12 rounded-full border-2 bg-card"
              onClick={() => void navigate({ to: "/" })}
            >
              <ArrowLeft className="size-5" />
            </Button>
            <h1 className="min-w-0 flex-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Messages
            </h1>
            <ThemeToggle prominent className="!size-12 shrink-0" />
            <Button
              type="button"
              size="icon"
              aria-label={user ? "Start a new conversation" : "Sign in to message"}
              className="!size-14 shrink-0 rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
              onClick={() => {
                if (!user) void navigate({ to: "/auth" });
                else {
                  setComposeError("");
                  setComposeOpen(true);
                }
              }}
            >
              <SquarePen className="!size-6" />
            </Button>
          </div>
        </header>
      ) : null}

      <div className={cn("px-4 pt-5 sm:px-6", !embedded && "md:pt-6")}>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-14 rounded-full border-2 bg-card pl-12 text-base shadow-sm placeholder:text-muted-foreground/80"
          />
        </label>
        {!embedded ? (
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Private one-to-one chats. Candid can always reach you with important updates.
          </p>
        ) : null}
        {!user && !loading && !embedded ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void navigate({ to: "/auth" })}
          >
            Sign in for private messages
          </Button>
        ) : null}
      </div>

      {loading || (isLoading && Boolean(user)) ? (
        <div className="mt-6 space-y-0 border-y border-border bg-background">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-24 animate-pulse border-b border-border bg-secondary/60" />
          ))}
        </div>
      ) : isError ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 border-y border-border bg-background px-4 py-8 text-center sm:px-6"
          role="alert"
        >
          <p className="font-medium">We couldn&apos;t load your conversations</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your messages are still here. Check your connection and try again.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? "Trying again…" : "Try again"}
          </Button>
        </motion.div>
      ) : conversations.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 border-y border-border bg-background px-4 py-10 text-center sm:px-6"
        >
          <Sparkles className="mx-auto size-8 text-primary" />
          <p className="mt-4 font-medium">No conversations yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open someone&apos;s profile and tap Message to start a chat.
          </p>
        </motion.div>
      ) : matchingConversations.length === 0 ? (
        <div className="mt-6 border-y border-border bg-background px-4 py-8 text-center sm:px-6">
          <Search className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 font-semibold">No chats match “{search.trim()}”</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a username or a word from a message.
          </p>
        </div>
      ) : (
        <ul
          className={cn(
            "mt-6 border-y border-border bg-background",
            embedded && "mt-4",
          )}
        >
          <AnimatePresence initial={false}>
            {visibleConversations.map((item, index) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: { delay: index * 0.03 } }}
                exit={{ opacity: 0 }}
                className={cn(
                  "border-b border-border last:border-b-0",
                  item.unread > 0 && "border-l-4 border-l-primary bg-primary/[0.07]",
                )}
              >
                <div className="flex min-h-24 w-full items-center gap-4 px-4 py-4 transition-colors hover:bg-secondary/30 sm:px-5">
                  <button
                    type="button"
                    aria-label={`Open conversation with @${item.with?.username ?? "member"}`}
                    onClick={() => {
                      if (onSelectConversation) onSelectConversation(item.id);
                      else void navigate({ to: "/messages/$id", params: { id: item.id } });
                    }}
                    className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ProfileAvatar
                      photoUrl={item.with?.photo_url}
                      initials={item.with?.username?.slice(0, 2) ?? "??"}
                      className="size-14 border border-border/70 text-lg uppercase"
                    />
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {item.with?.username ? (
                        <Link
                          to="/u/$username"
                          params={{ username: item.with.username }}
                          className="truncate font-display text-base font-bold hover:text-primary sm:text-lg"
                        >
                          @{item.with.username}
                        </Link>
                      ) : (
                        <span className="truncate font-medium">Member</span>
                      )}
                      {item.with?.verified ? (
                        <BadgeCheck className="size-4 shrink-0 text-primary" />
                      ) : null}
                      <MembershipBadge
                        tier={item.with?.membership_tier}
                        official={item.with?.official}
                      />
                      <span className="ml-auto shrink-0 pl-2 text-sm font-semibold text-muted-foreground">
                        {timeAgo(item.last_message_at)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (onSelectConversation) onSelectConversation(item.id);
                        else void navigate({ to: "/messages/$id", params: { id: item.id } });
                      }}
                      className={cn(
                        "mt-1 block w-full truncate text-left text-sm text-muted-foreground sm:text-base",
                        item.unread > 0 && "font-semibold text-foreground",
                      )}
                    >
                      {item.mine ? "You: " : ""}
                      {item.last_message || "Say hello"}
                    </button>
                  </span>
                  {item.unread > 0 ? (
                    <span
                      aria-label={`${item.unread} unread messages`}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                    >
                      {item.unread > 9 ? "9+" : item.unread}
                    </span>
                  ) : null}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {!search.trim() &&
      visibleConversations.length > 0 &&
      (conversations.length > visibleConversations.length || hasNextPage) ? (
        <div className="flex flex-col items-center gap-2 px-4 py-5 sm:px-6">
          <p className="text-xs text-muted-foreground">
            {hasNextPage
              ? `Showing ${visibleConversations.length.toLocaleString()} conversations loaded so far`
              : `Showing ${visibleConversations.length.toLocaleString()} of ${conversations.length.toLocaleString()} conversations`}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={isFetchingNextPage}
            onClick={(event) => {
              if (visibleCount < conversations.length) {
                expandBy(20, event.currentTarget);
              } else if (hasNextPage) {
                const anchor = event.currentTarget;
                void fetchNextPage().then((result) => {
                  if (result.isSuccess) expandBy(20, anchor);
                });
              }
            }}
          >
            {isFetchingNextPage
              ? "Loading conversations…"
              : visibleCount < conversations.length
                ? "Show 20 more"
                : "Load next 20 conversations"}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={composeOpen}
        onOpenChange={(open) => {
          if (!startingConversation) setComposeOpen(open);
          if (!open) setComposeError("");
        }}
      >
        <DialogContent className="rounded-3xl p-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">New message</DialogTitle>
            <DialogDescription>
              Enter a member’s Candid username to start a private chat.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleStartConversation(event)} className="space-y-4">
            <Input
              autoFocus
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setComposeError("");
              }}
              placeholder="@username"
              aria-label="Candid username"
              className="h-12 rounded-xl"
              maxLength={21}
            />
            {composeError ? <p className="text-sm text-destructive">{composeError}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={startingConversation}
                onClick={() => setComposeOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-full" disabled={startingConversation}>
                {startingConversation ? "Opening chat…" : "Start chat"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
