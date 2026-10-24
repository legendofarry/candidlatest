import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  CheckCheck,
  Download,
  ImagePlus,
  Loader2,
  Phone,
  Send,
  Smile,
  Trash2,
  X,
  Video,
} from "lucide-react";
import type { ConversationView } from "@/lib/messaging.server";
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
import { requestConversationCall } from "@/components/site/call-center";
import { onValue, ref } from "firebase/database";
import { firebaseRealtimeDb } from "@/integrations/firebase/client";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

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

function formatElapsed(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return "just now";
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 24 * 60 * 60_000) return `${Math.floor(elapsed / (60 * 60_000))}h ago`;
  return `${Math.floor(elapsed / (24 * 60 * 60_000))}d ago`;
}

function ChatScreen() {
  const { id } = useParams({ from: "/messages/$id" });
  return (
    <div className="h-full min-h-0 xl:hidden">
      <MessagesThread id={id} />
    </div>
  );
}

export function MessagesThread({ id, inSidebar = false }: { id: string; inSidebar?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchConversation = useServerFn(getConversation);
  const sendMessage = useServerFn(postMessage);
  const deleteMessage = useServerFn(deleteChatMessage);
  const react = useServerFn(reactToMessage);
  const issueImageUpload = useServerFn(issueChatImageUpload);
  const discardImageUpload = useServerFn(discardChatImageUpload);
  const conversationQueryKey = ["conversation", id, user?.uid ?? null] as const;

  const [draft, setDraft] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [openImageUrl, setOpenImageUrl] = useState<string | null>(null);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageReceipt, setImageReceipt] = useState<ChatImageReceipt | null>(null);
  const [imageTicketId, setImageTicketId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const [partnerPresence, setPartnerPresence] = useState<{ online: boolean; lastChanged: number | null }>({ online: false, lastChanged: null });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageTicketRef = useRef<string | null>(null);
  const discardUploadRef = useRef(discardImageUpload);
  const bottomRef = useRef<HTMLDivElement>(null);
  const skipNextAutoScroll = useRef(false);
  const hasLoadedFullThread = useRef(false);

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

  useEffect(
    () => () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    },
    [imagePreview],
  );

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: conversationQueryKey,
    queryFn: async () => {
      const previous = queryClient.getQueryData<ConversationView>(conversationQueryKey);
      const refreshImages = previous?.messages.slice(-50).some((message) => {
        if (!message.image) return false;
        return (
          !message.image.delivery_url ||
          message.image.delivery_url_expires_at <= Math.floor(Date.now() / 1000) + 15 * 60
        );
      });
      let latest = await fetchConversation({
        data: {
          conversation_id: id,
          cursor: null,
          known_activity_at:
            hasLoadedFullThread.current && previous && !refreshImages
              ? (previous.activity_at ?? null)
              : null,
        },
      });
      // An "unchanged" response omits participant details. If a stale cache has no
      // partner profile, fetch the full thread once so the chat header can recover.
      if (latest.unchanged && !previous?.with) {
        latest = await fetchConversation({
          data: { conversation_id: id, cursor: null, known_activity_at: null },
        });
      }
      if (!latest.unchanged) hasLoadedFullThread.current = true;
      if (latest.unread_cleared && user?.uid) {
        void queryClient.invalidateQueries({ queryKey: ["unread-messages", user.uid] });
        void queryClient.invalidateQueries({ queryKey: ["conversations", user.uid] });
      }
      if (latest.unchanged && previous) return { ...previous, unread_cleared: false };
      if (!previous) return latest;
      if (previous.messages.length <= 50) {
        return { ...latest, with: latest.with ?? previous.with };
      }
      const byId = new Map(previous.messages.map((message) => [message.id, message]));
      for (const message of latest.messages) byId.set(message.id, message);
      return {
        ...latest,
        with: latest.with ?? previous.with,
        messages: [...byId.values()].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        ),
        hasOlder: previous.hasOlder,
        nextCursor: previous.nextCursor,
      };
    },
    enabled: Boolean(user),
    refetchInterval: 30_000,
    retry: (failureCount, queryError) => {
      const message = queryError instanceof Error ? queryError.message.toLowerCase() : "";
      if (message.includes("conversation not found") || message.includes("not your conversation")) {
        return false;
      }
      return failureCount < 1;
    },
  });

  const conversation = data;
  const partner = conversation?.with;
  const messages = useMemo(() => conversation?.messages ?? [], [conversation]);

  useEffect(() => {
    const db = firebaseRealtimeDb;
    if (!db || !partner?.id) {
      setPartnerPresence({ online: false, lastChanged: null });
      return;
    }
    return onValue(ref(db, `presence/${partner.id}`), (snapshot) => {
      setPartnerPresence({
        online: snapshot.child("state").val() === "online",
        lastChanged: Number(snapshot.child("last_changed").val()) || null,
      });
    });
  }, [partner?.id]);

  const partnerActivity = partnerPresence.online
    ? "Active now"
    : partnerPresence.lastChanged
      ? `Active ${formatElapsed(partnerPresence.lastChanged)}`
      : "Candid member";

  async function loadOlderMessages() {
    const cursor = conversation?.nextCursor;
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await fetchConversation({
        data: { conversation_id: id, cursor },
      });
      skipNextAutoScroll.current = true;
      queryClient.setQueryData(conversationQueryKey, (current: typeof data) => {
        if (!current) return current;
        const known = new Set(current.messages.map((message) => message.id));
        return {
          ...current,
          messages: [
            ...older.messages.filter((message) => !known.has(message.id)),
            ...current.messages,
          ],
          hasOlder: older.hasOlder,
          nextCursor: older.nextCursor,
        };
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function downloadSharedImage(imageUrl: string) {
    setDownloadingImage(true);
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error("Image download failed.");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      const extension = ["jpeg", "jpg", "png", "webp"].includes(blob.type.split("/")[1] ?? "")
        ? (blob.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg")
        : "jpg";
      link.download = `candid-chat-photo-${Date.now()}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch {
      const link = document.createElement("a");
      link.href = imageUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.info("The photo opened in a new tab so you can save it there.");
    } finally {
      setDownloadingImage(false);
    }
  }

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
        data: {
          conversation_id: id,
          size: file.size,
          mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
        },
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
    if (skipNextAutoScroll.current) {
      skipNextAutoScroll.current = false;
      return;
    }
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
      const queryKey = conversationQueryKey;
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

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="font-medium">Sign in to view this conversation.</p>
        <Button className="mt-4" onClick={() => navigate({ to: "/auth" })}>
          Sign in
        </Button>
      </div>
    );
  }

  if (error && !conversation) {
    const unavailable =
      error instanceof Error &&
      (error.message.toLowerCase().includes("conversation not found") ||
        error.message.toLowerCase().includes("not your conversation"));
    return (
      <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
        <p className="font-medium">
          {unavailable
            ? "This conversation is no longer available."
            : "We couldn’t load this conversation."}
        </p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {unavailable
            ? "It may have been removed or you may no longer have access."
            : "Check your connection, then try again. Your messages have not been removed."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {!unavailable ? (
            <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
              {isFetching ? "Trying again…" : "Try again"}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => void navigate({ to: "/messages" })}>
            Back to messages
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden",
        inSidebar ? "mx-auto max-w-2xl bg-background md:mx-0 md:max-w-none" : "bg-black sm:bg-background",
      )}
    >
      <header className={cn(
        "sticky top-0 z-30 flex shrink-0 items-center gap-2 transition-colors",
        inSidebar ? "glass-card mb-4 rounded-2xl bg-background/95 p-3 backdrop-blur" : "border-b border-zinc-800 bg-zinc-950 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white sm:border-border sm:bg-background/95 sm:px-5 sm:py-3.5 sm:text-foreground sm:backdrop-blur",
      )}>
        {!inSidebar ? <Button type="button" variant="ghost" size="icon" aria-label="Back to messages" className="size-9 shrink-0 rounded-full text-white hover:bg-white/10 hover:text-white sm:text-foreground sm:hover:bg-accent sm:hover:text-foreground" onClick={() => void navigate({ to: "/messages" })}><ArrowLeft className="size-5" /></Button> : null}
        <button type="button" onClick={() => { if (partner) void navigate({ to: "/u/$username", params: { username: partner.username } }); }} className="flex min-w-0 flex-1 items-center gap-3 text-left" disabled={!partner} aria-label={partner ? `View @${partner.username}'s profile` : undefined}>
          <ProfileAvatar photoUrl={partner?.photo_url} initials={partner?.username?.slice(0, 2) ?? "··"} className="size-10 shrink-0 font-display uppercase" />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-semibold">
              {partner ? `@${partner.username}` : isLoading ? "Loading conversation…" : "Member"}
              {partner?.verified ? <BadgeCheck className="size-4 text-primary" /> : null}
              <MembershipBadge tier={partner?.membership_tier} official={partner?.official} />
            </span>
            <span className="flex items-center gap-1.5 text-xs text-zinc-400 sm:text-muted-foreground">{partnerPresence.online ? <span className="size-2 rounded-full bg-emerald-500" /> : null}{partner?.official ? "Official Candid account" : partnerActivity}</span>
          </span>
        </button>
        {partner ? <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="Start voice call" title="Voice call" className="size-10 rounded-full text-white hover:bg-white/10 hover:text-white sm:text-foreground sm:hover:bg-accent sm:hover:text-foreground" onClick={() => requestConversationCall(id, "audio")}><Phone className="size-5" /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Start video call" title="Video call" className="size-10 rounded-full text-white hover:bg-white/10 hover:text-white sm:text-foreground sm:hover:bg-accent sm:hover:text-foreground" onClick={() => requestConversationCall(id, "video")}><Video className="size-5" /></Button>
        </div> : null}
      </header>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          inSidebar ? "space-y-3 pb-4" : "bg-black px-3 py-5 text-white sm:bg-background sm:px-6 sm:text-foreground",
        )}
      >
          <div className={cn("flex flex-col gap-3", !inSidebar && "mx-auto w-full max-w-2xl")}>
          {conversation?.hasOlder ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loadingOlder}
                onClick={() => void loadOlderMessages()}
              >
                {loadingOlder ? "Loading…" : "Load older messages"}
              </Button>
            </div>
          ) : null}
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex min-h-40 flex-1 items-center justify-center py-10 text-center">
              <p className="text-sm text-zinc-400 sm:text-muted-foreground">No messages yet — say hello.</p>
            </div>
          ) : null}

          <AnimatePresence initial={false}>
            {messages.map((message, messageIndex) => {
              const mine = message.sender_id === user?.uid;
              const nextMessage = messages[messageIndex + 1];
              const showPartnerAvatar = !mine && (!nextMessage || nextMessage.sender_id !== message.sender_id);
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
                  {!mine && showPartnerAvatar ? <ProfileAvatar photoUrl={partner?.photo_url} initials={partner?.username?.slice(0, 2) ?? "··"} className="mb-5 mr-2 size-7 shrink-0 self-end sm:hidden" /> : null}
                  <div
                    className={cn("flex max-w-[82%] flex-col", mine ? "items-end" : "items-start")}
                  >
                    {message.is_deleted ? (
                      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm italic text-zinc-400 sm:border-border/70 sm:bg-transparent sm:text-muted-foreground">
                        This message was deleted
                      </div>
                    ) : (
                      <>
                        {message.image?.delivery_url ? (
                          <button
                            type="button"
                            onClick={() => setOpenImageUrl(message.image!.delivery_url)}
                            className="max-w-full overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="View shared image full screen"
                          >
                            <img
                              src={message.image.delivery_url}
                              alt="Image shared in chat"
                              loading="lazy"
                              className="max-h-80 max-w-full cursor-zoom-in object-contain"
                            />
                          </button>
                        ) : null}
                        {message.body ? (
                          <div
                            className={cn(
                              "rounded-[1.35rem] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm sm:rounded-3xl sm:text-sm",
                              mine
                                ? "rounded-br-md bg-gradient-to-br from-primary to-lime-400 text-zinc-950 sm:bg-primary sm:text-primary-foreground"
                                : "rounded-bl-md bg-[#262626] text-white sm:border sm:border-border sm:bg-card sm:text-foreground",
                            )}
                          >
                            <p className="whitespace-pre-wrap">{message.body}</p>
                          </div>
                        ) : null}
                      </>
                    )}

                    <div
                      className={cn(
                        "mt-1 flex items-center gap-1.5 px-1 text-[11px] text-zinc-500 sm:text-muted-foreground",
                        mine ? "justify-end" : "justify-start",
                      )}
                    >
                      <span>{clock(message.created_at)}</span>
                      {mine &&
                      !message.is_deleted &&
                      clockNow - new Date(message.created_at).getTime() >= 0 &&
                      clockNow - new Date(message.created_at).getTime() <= 120_000 ? (
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
                      {!message.is_deleted ? (
                        <Popover
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
                          <PopoverContent
                            className="z-[120] w-auto rounded-full p-1.5"
                            align="center"
                          >
                            <div className="flex gap-1">
                              {EMOJI.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => {
                                    toggleReaction.mutate({ message_id: message.id, emoji });
                                    setReactionPickerFor(null);
                                  }}
                                  className="rounded-full px-1.5 py-1 text-base transition-transform hover:scale-125"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : null}
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
                            className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-white sm:border-border sm:bg-card sm:text-foreground"
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
          <p className="border-y border-zinc-800 bg-zinc-950 p-4 text-center text-sm text-zinc-400 sm:rounded-2xl sm:border sm:border-border sm:bg-secondary/40 sm:text-muted-foreground">
            {conversation.blocked_reason}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "shrink-0",
            inSidebar
              ? "glass-card rounded-3xl p-2"
              : "border-t border-zinc-800 bg-zinc-950 px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2 text-white sm:border-border sm:bg-background/95 sm:px-6 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pt-3 sm:text-foreground sm:backdrop-blur",
          )}
        >
          <div
            className={cn(
              "flex flex-col gap-2",
              !inSidebar &&
                "mx-auto w-full max-w-2xl rounded-full bg-[#262626] p-1 sm:rounded-2xl sm:border sm:border-border sm:bg-card sm:p-1.5 sm:shadow-sm",
            )}
          >
            {imagePreview ? (
              <div className="relative mx-1 mt-1 w-fit rounded-xl border border-border bg-background p-1.5">
                <img
                  src={imagePreview}
                  alt="Image ready to send"
                  className="h-20 max-w-32 rounded-lg object-cover"
                />
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
                className="size-11 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground sm:size-10 sm:bg-transparent sm:text-foreground sm:hover:bg-accent"
              >
                <Camera className="size-5 sm:hidden" />
                <ImagePlus className="hidden size-5 sm:block" />
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
                className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent px-2.5 py-2 text-white placeholder:text-zinc-400 focus-visible:ring-0 sm:text-foreground sm:placeholder:text-muted-foreground"
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

      <Dialog open={Boolean(openImageUrl)} onOpenChange={(open) => !open && setOpenImageUrl(null)}>
        <DialogContent
          hideCloseButton
          className="!inset-0 !left-0 !top-0 !h-[100dvh] !max-w-none !translate-x-0 !translate-y-0 rounded-none border-0 bg-black/95 p-4 sm:p-10 lg:p-16"
        >
          <DialogTitle className="sr-only">Shared image</DialogTitle>
          <DialogDescription className="sr-only">A full-screen image shared in this conversation.</DialogDescription>
          <DialogClose asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-10 !size-12 rounded-full bg-card text-foreground shadow-lg"
              aria-label="Close image"
            >
              <X className="size-5" />
            </Button>
          </DialogClose>
          {openImageUrl ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              disabled={downloadingImage}
              onClick={() => void downloadSharedImage(openImageUrl)}
              className="absolute right-20 top-[calc(1rem+env(safe-area-inset-top))] z-10 !size-12 rounded-full bg-card text-foreground shadow-lg"
              aria-label="Download image"
              title="Download image"
            >
              {downloadingImage ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
            </Button>
          ) : null}
          {openImageUrl ? (
            <img
              src={openImageUrl}
              alt="Full-screen shared image"
              className="mx-auto h-full w-full rounded-lg object-contain shadow-2xl"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
