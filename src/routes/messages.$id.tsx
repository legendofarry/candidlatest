import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, CheckCheck, ImagePlus, Loader2, Send, Smile, Trash2, X } from "lucide-react";
import {
  discardChatImageUpload,
  deleteChatMessage,
  getConversation,
  issueChatImageUpload,
  postMessage,
  reactToMessage,
} from "@/lib/messaging.functions";
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
const CHAT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

type ChatImageReceipt = {
  ticket_id: string;
  public_id: string;
  version: number;
  signature: string;
  format: "jpg" | "png" | "webp";
  bytes: number;
};

type CloudinaryChatUpload = {
  public_id?: string;
  resource_type?: string;
  type?: string;
  version?: number;
  signature?: string;
  format?: string;
  bytes?: number;
  error?: { message?: string };
};

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
  const deleteMessage = useServerFn(deleteChatMessage);
  const react = useServerFn(reactToMessage);
  const issueImageUpload = useServerFn(issueChatImageUpload);
  const discardImageUpload = useServerFn(discardChatImageUpload);

  const [draft, setDraft] = useState("");
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageReceipt, setImageReceipt] = useState<ChatImageReceipt | null>(null);
  const [imageTicketId, setImageTicketId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageTicketRef = useRef<string | null>(null);
  const discardUploadRef = useRef(discardImageUpload);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    discardUploadRef.current = discardImageUpload;
  }, [discardImageUpload]);

  useEffect(
    () => () => {
      const ticketId = imageTicketRef.current;
      if (ticketId) {
        void discardUploadRef.current({ data: { ticket_id: ticketId } }).catch(() => undefined);
      }
    },
    [],
  );

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => fetchConversation({ data: { conversation_id: id } }),
    enabled: Boolean(user),
    refetchInterval: 8000,
  });

  const conversation = data;
  const messages = useMemo(() => conversation?.messages ?? [], [conversation]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function clearImageAttachment() {
    if (imageTicketId) {
      try {
        await discardImageUpload({ data: { ticket_id: imageTicketId } });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not remove this image.");
        return false;
      }
      imageTicketRef.current = null;
    }
    setImageReceipt(null);
    setImageTicketId(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    return true;
  }

  async function chooseImage(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      toast.error("Images must be 8 MB or smaller.");
      return;
    }
    if (imageTicketId && !(await clearImageAttachment())) return;
    setImagePreview(URL.createObjectURL(file));
    setImageReceipt(null);
    setUploadingImage(true);
    let ticketId: string | null = null;
    try {
      const ticket = await issueImageUpload({
        data: { conversation_id: id, size: file.size, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" },
      });
      ticketId = ticket.ticketId;
      imageTicketRef.current = ticket.ticketId;
      setImageTicketId(ticket.ticketId);
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", ticket.apiKey);
      form.append("timestamp", String(ticket.timestamp));
      form.append("public_id", ticket.publicId);
      form.append("type", ticket.type);
      form.append("overwrite", String(ticket.overwrite));
      form.append("signature", ticket.signature);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(ticket.cloudName)}/image/upload`,
        { method: "POST", body: form },
      );
      const result = (await response.json().catch(() => ({}))) as CloudinaryChatUpload;
      if (!response.ok) throw new Error(result.error?.message || "Image upload failed.");
      if (
        result.public_id !== ticket.publicId ||
        result.resource_type !== "image" ||
        result.type !== "authenticated" ||
        !Number.isInteger(result.version) ||
        typeof result.signature !== "string" ||
        !["jpg", "png", "webp"].includes(result.format ?? "") ||
        result.bytes !== file.size
      ) {
        throw new Error("The uploaded image could not be verified. Please try again.");
      }
      setImageReceipt({
        ticket_id: ticket.ticketId,
        public_id: result.public_id,
        version: result.version!,
        signature: result.signature!,
        format: result.format as ChatImageReceipt["format"],
        bytes: result.bytes!,
      });
    } catch (error) {
      if (ticketId) {
        try {
          await discardImageUpload({ data: { ticket_id: ticketId } });
        } catch {
          // The original upload error is the one the user needs to see.
        }
      }
      imageTicketRef.current = null;
      setImageReceipt(null);
      setImageTicketId(null);
      setImagePreview(null);
      toast.error("Image not attached", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setUploadingImage(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async () =>
      sendMessage({ data: { conversation_id: id, body: draft, image: imageReceipt } }),
    onSuccess: () => {
      setDraft("");
      imageTicketRef.current = null;
      setImageReceipt(null);
      setImageTicketId(null);
      setImagePreview(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["conversation", id] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err: Error) => toast.error("Message not sent", { description: err.message }),
  });

  const removeMessage = useMutation({
    mutationFn: (messageId: string) => deleteMessage({ data: { message_id: messageId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversation", id] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleReaction = useMutation({
    mutationFn: async (input: { message_id: string; emoji: string }) => react({ data: input }),
    onMutate: async ({ message_id, emoji }) => {
      const queryKey = ["conversation", id] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<NonNullable<typeof data>>(queryKey);
      if (user && previous) {
        queryClient.setQueryData<NonNullable<typeof data>>(queryKey, {
          ...previous,
          messages: previous.messages.map((message) => {
            if (message.id !== message_id) return message;
            const reactors = message.reactions?.[emoji] ?? [];
            const hasReacted = reactors.includes(user.uid);
            return {
              ...message,
              reactions: {
                ...message.reactions,
                [emoji]: hasReacted
                  ? reactors.filter((reactorId) => reactorId !== user.uid)
                  : [...reactors, user.uid],
              },
            };
          }),
        });
      }
      return { previous, queryKey };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
    },
    onSettled: (_result, _error, _input, context) => {
      void queryClient.invalidateQueries({ queryKey: context?.queryKey ?? ["conversation", id] });
    },
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
                  {message.is_deleted ? (
                    <div className="rounded-3xl border border-border/70 px-4 py-2.5 text-sm italic text-muted-foreground">
                      This message was deleted
                    </div>
                  ) : (
                    <>
                      {message.image?.delivery_url ? (
                        <img
                          src={message.image.delivery_url}
                          alt="Image shared in chat"
                          loading="lazy"
                          className="max-h-80 max-w-full rounded-xl object-contain"
                        />
                      ) : null}
                      {message.body ? (
                        <div className={cn(
                          "rounded-3xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                          mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-card",
                        )}>
                          <p className="whitespace-pre-wrap">{message.body}</p>
                        </div>
                      ) : null}
                    </>
                  )}

                  <div
                    className={cn(
                      "mt-1 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground",
                      mine ? "justify-end" : "justify-start",
                    )}
                  >
                    <span>{clock(message.created_at)}</span>
                    {mine && !message.is_deleted && clockNow - new Date(message.created_at).getTime() >= 0 && clockNow - new Date(message.created_at).getTime() <= 120_000 ? (
                      <button
                        type="button"
                        aria-label="Delete message for everyone"
                        title="Delete for everyone"
                        disabled={removeMessage.isPending}
                        onClick={() => removeMessage.mutate(message.id)}
                        className="rounded p-0.5 hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                    {!message.is_deleted ? <Popover
                      open={reactionPickerFor === message.id}
                      onOpenChange={(open) => setReactionPickerFor(open ? message.id : null)}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="React to message"
                          className="rounded-full p-0.5 transition-colors hover:text-foreground"
                        >
                          <Smile className="size-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="z-[120] w-auto rounded-full p-1.5" align="center">
                        <div className="flex gap-1">
                          {EMOJI.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                toggleReaction.mutate({ message_id: message.id, emoji })
                                setReactionPickerFor(null);
                              }}
                              className="rounded-full px-1.5 py-1 text-base transition-transform hover:scale-125"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover> : null}
                    {mine ? (
                      <CheckCheck className={cn("size-3.5", message.read_at && "text-primary")} />
                    ) : null}
                  </div>

                  {!message.is_deleted && reactions.length > 0 ? (
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
              "flex flex-col gap-2",
              !inSidebar &&
                "mx-auto max-w-2xl rounded-2xl border border-border bg-card p-1.5 shadow-sm",
            )}
          >
            {imagePreview ? (
              <div className="relative mx-1 mt-1 w-fit rounded-xl border border-border bg-background p-1.5">
                <img src={imagePreview} alt="Image ready to send" className="h-20 max-w-32 rounded-lg object-cover" />
                <span className="absolute -right-2 -top-2 rounded-full bg-background shadow">
                  <button
                    type="button"
                    aria-label="Remove attached image"
                    disabled={uploadingImage || send.isPending}
                    onClick={() => void clearImageAttachment()}
                    className="flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
                {uploadingImage ? (
                  <span className="absolute inset-1 flex items-center justify-center rounded-lg bg-background/75">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  void chooseImage(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Attach image"
                title="Attach image"
                disabled={uploadingImage || send.isPending || !conversation?.can_send}
                onClick={() => imageInputRef.current?.click()}
                className="shrink-0 rounded-full"
              >
                <ImagePlus className="size-5" />
              </Button>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (draft.trim() || imageReceipt) send.mutate();
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
              disabled={send.isPending || uploadingImage || (!draft.trim() && !imageReceipt)}
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
        </div>
      )}
    </div>
  );
}
