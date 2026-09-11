import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, CheckCheck, ImagePlus, Loader2, Send, Smile, X } from "lucide-react";
import {
  getConversation,
  postMessage,
  reactToMessage,
} from "@/lib/messaging.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { notify as toast } from "@/lib/notifications-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/messages/$id")({
  head: () => ({
    meta: [
      { title: "Chat | Candid" },
      {
        name: "description",
        content:
          "A private Candid chat: send messages, react with emoji, share images and see when your message was read.",
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchConversation = useServerFn(getConversation);
  const sendMessage = useServerFn(postMessage);
  const react = useServerFn(reactToMessage);

  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<{
    url: string;
    name: string;
    kind: "image" | "file";
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => fetchConversation({ data: { conversation_id: id } }),
    enabled: Boolean(user),
    refetchInterval: 8000,
  });

  const messages = useMemo(() => data?.messages ?? [], [data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async () =>
      sendMessage({
        data: { conversation_id: id, body: draft, attachment },
      }),
    onSuccess: () => {
      setDraft("");
      setAttachment(null);
      void queryClient.invalidateQueries({ queryKey: ["conversation", id] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err: Error) => toast.error("Message not sent", { description: err.message }),
  });

  const toggleReaction = useMutation({
    mutationFn: async (input: { message_id: string; emoji: string }) =>
      react({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversation", id] }),
  });

  async function pickFile(file: File) {
    setUploading(true);
    try {
      const { getDownloadURL, getStorage, ref, uploadBytes } = await import("firebase/storage");
      const { firebaseApp } = await import("@/integrations/firebase/client");
      const storageRef = ref(
        getStorage(firebaseApp),
        `chat/${id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`,
      );
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setAttachment({
        url,
        name: file.name,
        kind: file.type.startsWith("image/") ? "image" : "file",
      });
    } catch {
      toast.error("Upload failed", {
        description: "That attachment could not be uploaded. Try a smaller file.",
      });
    } finally {
      setUploading(false);
    }
  }

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

  const partner = data?.with;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col">
      <button
        type="button"
        onClick={() =>
          partner &&
          navigate({ to: "/u/$username", params: { username: partner.username } })
        }
        className="glass-card sticky top-[6.75rem] z-30 mb-4 flex items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-secondary/40"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/5 font-display font-semibold uppercase">
          {partner?.username?.slice(0, 2) ?? "··"}
        </span>
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            @{partner?.username ?? "…"}
            {partner?.verified ? <BadgeCheck className="size-4 text-primary" /> : null}
          </span>
          <span className="block text-xs text-muted-foreground">
            {partner?.official ? "Official Candid account" : "Tap to view profile"}
          </span>
        </span>
      </button>

      <div className="flex-1 space-y-3 pb-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet — say hello.
          </p>
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
                <div className={cn("max-w-[80%]", mine ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "rounded-3xl px-4 py-2.5 text-sm shadow-sm",
                      mine
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md border border-border bg-card",
                    )}
                  >
                    {message.attachment?.kind === "image" ? (
                      <img
                        src={message.attachment.url}
                        alt={message.attachment.name}
                        loading="lazy"
                        className="mb-2 max-h-64 rounded-2xl object-cover"
                      />
                    ) : message.attachment ? (
                      <a
                        href={message.attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-2 block underline"
                      >
                        {message.attachment.name}
                      </a>
                    ) : null}
                    {message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : null}
                  </div>

                  <div
                    className={cn(
                      "mt-1 flex items-center gap-2 text-[11px] text-muted-foreground",
                      mine ? "justify-end" : "justify-start",
                    )}
                  >
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
                    <span>{clock(message.created_at)}</span>
                    {mine ? (
                      <CheckCheck
                        className={cn("size-3.5", message.read_at && "text-primary")}
                      />
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

      {data && !data.can_send ? (
        <p className="rounded-2xl border border-border bg-secondary/40 p-4 text-center text-sm text-muted-foreground">
          {data.blocked_reason}
        </p>
      ) : (
        <div className="glass-card sticky bottom-4 rounded-3xl p-2">
          {attachment ? (
            <div className="mb-2 flex items-center gap-2 rounded-2xl bg-secondary/60 px-3 py-2 text-xs">
              <span className="truncate">{attachment.name}</span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                aria-label="Remove attachment"
                className="ml-auto"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void pickFile(file);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Add attachment"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
            </Button>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (draft.trim() || attachment) send.mutate();
                }
              }}
              rows={1}
              placeholder="Write a message"
              className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent focus-visible:ring-0"
            />
            <Button
              type="button"
              size="icon"
              className="glow-primary rounded-full"
              aria-label="Send message"
              disabled={send.isPending || (!draft.trim() && !attachment)}
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
