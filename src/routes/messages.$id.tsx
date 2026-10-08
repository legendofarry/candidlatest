import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, CheckCheck, Loader2, Send, Smile } from "lucide-react";
import { getConversation, postMessage, reactToMessage } from "@/lib/messaging.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { notify as toast } from "@/lib/notifications-store";
import { cn } from "@/lib/utils";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { MembershipBadge } from "@/components/site/membership-badge";

export const Route = createFileRoute("/messages/$id")({
  head: () => ({
    meta: [
      { title: "Chat | Candid" },
      {
        name: "description",
        content:
          "A private Candid chat: send messages, react with emoji, and see when your message was read.",
      },
      { property: "og:title", content: "Chat | Candid" },
      { property: "og:description", content: "A private one-to-one conversation on Candid." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatScreen,
});

const EMOJI = ["❤️", "😂", "😮", "😢", "🔥", "👏", "👍", "🙏"];

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ChatScreen() {
  const { id } = useParams({ from: "/messages/$id" });
  return (
    <div className="h-[calc(100dvh-4rem)] min-h-[30rem] xl:hidden">
      <MessagesThread id={id} />
    </div>
  );
}

export function MessagesThread({ id, inSidebar = false }: { id: string; inSidebar?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchConversation = useServerFn(getConversation);
  const sendMessage = useServerFn(postMessage);
  const react = useServerFn(reactToMessage);

  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => fetchConversation({ data: { conversation_id: id } }),
    enabled: Boolean(user),
    refetchInterval: 8000,
  });

  const conversation = data;
  const messages = useMemo(() => conversation?.messages ?? [], [conversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async () => sendMessage({ data: { conversation_id: id, body: draft } }),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["conversation", id] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err: Error) => toast.error("Message not sent", { description: err.message }),
  });

  const toggleReaction = useMutation({
    mutationFn: async (input: { message_id: string; emoji: string }) => react({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversation", id] }),
  });

  if (error) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="font-medium">This conversation is not available.</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate({ to: "/messages" })}>
          Back to messages
        </Button>
      </div>
    );
  }

  const partner = conversation?.with;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col",
        inSidebar ? "mx-auto max-w-2xl md:mx-0 md:max-w-none" : "bg-background",
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (partner)
            void navigate({ to: "/u/$username", params: { username: partner.username } });
        }}
        className={cn(
          "flex shrink-0 items-center gap-3 text-left transition-colors hover:bg-secondary/40",
          inSidebar
            ? "glass-card mb-4 rounded-2xl p-3"
            : "border-b border-border bg-background px-5 py-3.5",
        )}
      >
        <ProfileAvatar
          photoUrl={partner?.photo_url}
          initials={partner?.username?.slice(0, 2) ?? "··"}
          className="size-10 shrink-0 font-display uppercase"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-medium">
            @{partner?.username ?? "…"}
            {partner?.verified ? <BadgeCheck className="size-4 text-primary" /> : null}
            <MembershipBadge tier={partner?.membership_tier} />
          </span>
          <span className="block text-xs text-muted-foreground">
            {partner?.official ? "Official Candid account" : "Tap to view profile"}
          </span>
        </span>
      </button>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          inSidebar ? "space-y-3 pb-4" : "px-4 py-5 sm:px-6",
        )}
      >
        <div
          className={cn(
            "flex flex-col gap-3",
            !inSidebar && "mx-auto max-w-2xl",
          )}
        >
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex min-h-40 flex-1 items-center justify-center py-10 text-center">
            <p className="text-sm text-muted-foreground">No messages yet — say hello.</p>
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {messages.map((message) => {
            const mine = message.sender_id === user?.uid;
            const reactions = Object.entries(message.reactions ?? {}).filter(
              ([, ids]) => ids.length > 0,
            );
            return (
              <motion.div
                key={message.id}
                layout
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn("flex", mine ? "justify-end" : "justify-start")}
              >
                <div className={cn("flex max-w-[82%] flex-col", mine ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "rounded-3xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                      mine
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md border border-border bg-card",
                    )}
                  >
                    {message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : null}
                  </div>

                  <div
                    className={cn(
                      "mt-1 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground",
                      mine ? "justify-end" : "justify-start",
                    )}
                  >
                    <span>{clock(message.created_at)}</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="React to message"
                          className="rounded-full p-0.5 transition-colors hover:text-foreground"
                        >
                          <Smile className="size-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto rounded-full p-1.5" align="center">
                        <div className="flex gap-1">
                          {EMOJI.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() =>
                                toggleReaction.mutate({ message_id: message.id, emoji })
                              }
                              className="rounded-full px-1.5 py-1 text-base transition-transform hover:scale-125"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {mine ? (
                      <CheckCheck className={cn("size-3.5", message.read_at && "text-primary")} />
                    ) : null}
                  </div>

                  {reactions.length > 0 ? (
                    <div className={cn("mt-1 flex gap-1", mine ? "justify-end" : "")}>
                      {reactions.map(([emoji, ids]) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => toggleReaction.mutate({ message_id: message.id, emoji })}
                          className="rounded-full border border-border bg-card px-2 py-0.5 text-xs"
                        >
                          {emoji} {ids.length}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
        </div>
      </div>

      {conversation && !conversation.can_send ? (
        <div className={cn("shrink-0", !inSidebar && "border-t border-border bg-background p-4")}>
          <p className="rounded-2xl border border-border bg-secondary/40 p-4 text-center text-sm text-muted-foreground">
            {conversation.blocked_reason}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "shrink-0",
            inSidebar
              ? "glass-card rounded-3xl p-2"
              : "border-t border-border bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-6",
          )}
        >
          <div
            className={cn(
              "flex items-end gap-2",
              !inSidebar &&
                "mx-auto max-w-2xl rounded-2xl border border-border bg-card p-1.5 shadow-sm",
            )}
          >
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (draft.trim()) send.mutate();
                }
              }}
              rows={1}
              placeholder="Write a message"
              className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent px-2.5 py-2 focus-visible:ring-0"
            />
            <Button
              type="button"
              size="icon"
              className="glow-primary rounded-full"
              aria-label="Send message"
              disabled={send.isPending || !draft.trim()}
              onClick={() => send.mutate()}
            >
              {send.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
