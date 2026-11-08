import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCheck,
  Copy,
  Forward,
  Download,
  ImagePlus,
  Loader2,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import type { ConversationView } from "@/lib/messaging.server";
import {
  discardChatImageUpload,
  deleteChatMessage,
  getConversation,
  issueChatImageUpload,
  postMessage,
  reactToMessage,
  getChatPreferences,
  saveChatPreferences,
} from "@/lib/messaging.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { notify as toast } from "@/lib/notifications-store";
import { cn } from "@/lib/utils";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { MembershipBadge } from "@/components/site/membership-badge";
import { MessageAppearanceSettings } from "@/components/site/message-appearance-settings";
import {
  getChatDataAttributes,
  getMessageAppearanceStyle,
  useChatLook,
  useChatPrefsSync,
} from "@/lib/message-appearance";
import { ChatWallpaper } from "@/components/site/chat-wallpaper";
import { ChatForwardDialog } from "@/components/site/chat-forward-dialog";
import { QuickEmojiReactions } from "@/components/site/quick-emoji-reactions";
import { appendEmoji } from "@/lib/composer-utils";
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
  const loadChatPrefs = useServerFn(getChatPreferences);
  const saveChatPrefs = useServerFn(saveChatPreferences);
  useChatPrefsSync(user?.uid ?? null, {
    load: () => loadChatPrefs(),
    save: (payload) => saveChatPrefs({ data: payload }),
  });
  const { look: appearance, behavior } = useChatLook(user?.uid ?? null, id);
  const conversationQueryKey = ["conversation", id, user?.uid ?? null] as const;

  const [draft, setDraft] = useState("");
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [openImageUrl, setOpenImageUrl] = useState<string | null>(null);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageReceipt, setImageReceipt] = useState<ChatImageReceipt | null>(null);
  const [imageTicketId, setImageTicketId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [forwardOpen, setForwardOpen] = useState(false);
  const [selectReactOpen, setSelectReactOpen] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const selecting = selected.size > 0;
  useEffect(() => {
    if (!selecting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);
  const [partnerPresence, setPartnerPresence] = useState<{
    online: boolean;
    lastChanged: number | null;
  }>({ online: false, lastChanged: null });
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
    onSuccess: (sentMessage) => {
      if (sentMessage.delivery_state === "not_delivered") {
        queryClient.setQueryData<ConversationView>(conversationQueryKey, (current) => {
          if (!current || current.messages.some((message) => message.id === sentMessage.id))
            return current;
          return { ...current, messages: [...current.messages, sentMessage] };
        });
      }
      setDraft("");
      setComposerEmojiOpen(false);
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

  const buzz = (ms = 10) => {
    if (!behavior.haptics) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* haptics are optional */
    }
  };
  const clearSelection = () => setSelected(new Set());
  const toggleSelect = (message: (typeof messages)[number]) => {
    if (message.is_deleted) return;
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(message.id)) next.delete(message.id);
      else next.add(message.id);
      return next;
    });
    buzz(8);
  };
  const cancelPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const startPress = (message: (typeof messages)[number], event: React.PointerEvent) => {
    if (selecting || message.is_deleted || (event.pointerType === "mouse" && event.button !== 0))
      return;
    if ((event.target as HTMLElement).closest("button, a")) return;
    cancelPress();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      toggleSelect(message);
      buzz(18);
    }, 420);
  };
  const selectedMessages = messages.filter((message) => selected.has(message.id));
  const selectedText = selectedMessages
    .filter((message) => message.body)
    .map((message) => message.body)
    .join("\n");
  const canDeleteSelected =
    selectedMessages.length > 0 &&
    selectedMessages.every(
      (message) =>
        message.sender_id === user?.uid &&
        !message.is_deleted &&
        clockNow - new Date(message.created_at).getTime() <= 120_000,
    );
  const copySelected = async () => {
    try {
      await navigator.clipboard.writeText(selectedText);
      toast.success(selectedMessages.length > 1 ? "Messages copied" : "Message copied");
      clearSelection();
    } catch {
      toast.error("Could not copy", { description: "Your browser blocked clipboard access." });
    }
  };
  const reactSelected = (emoji: string) => {
    for (const message of selectedMessages) {
      if (!(message.reactions?.[emoji] ?? []).includes(user?.uid ?? ""))
        toggleReaction.mutate({ message_id: message.id, emoji });
    }
    setSelectReactOpen(false);
    clearSelection();
  };
  const deleteSelected = () => {
    for (const message of selectedMessages) removeMessage.mutate(message.id);
    clearSelection();
  };
  function jumpToMessage(messageId: string) {
    const element = document.getElementById(`msg-${messageId}`);
    if (!element) {
      toast.error("That message isn't loaded", {
        description: "Load older messages, then try again.",
      });
      return;
    }
    skipNextAutoScroll.current = true;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.dataset["flash"] = "1";
    window.setTimeout(() => delete element.dataset["flash"], 1600);
  }

  return (
    <div
      {...getChatDataAttributes(appearance, behavior)}
      style={getMessageAppearanceStyle(appearance)}
      className={cn(
        "candid-message-theme flex h-full min-h-0 w-full flex-col overflow-hidden",
        inSidebar
          ? cn("mx-auto max-w-2xl bg-background md:mx-0 md:max-w-none")
          : cn("bg-black sm:bg-background"),
      )}
    >
      <header
        className={cn(
          "sticky top-0 z-30 flex shrink-0 items-center gap-2 transition-colors",
          inSidebar
            ? cn("glass-card mb-4 rounded-2xl bg-background/95 p-3 backdrop-blur")
            : cn(
                "border-b border-zinc-800 bg-zinc-950 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white sm:border-border sm:bg-background/95 sm:px-5 sm:py-3.5 sm:text-foreground sm:backdrop-blur",
              ),
        )}
        data-chat-header
      >
        {selecting ? (
          <div className="flex w-full items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Cancel selection"
              className="size-10 rounded-full text-current max-sm:text-white max-sm:hover:bg-white/10"
              onClick={clearSelection}
            >
              <X className="size-5" />
            </Button>
            <span className="flex-1 px-1 font-semibold" aria-live="polite">
              {selected.size} selected
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Copy selected messages"
              title="Copy"
              disabled={!selectedText}
              className="size-10 rounded-full text-current max-sm:text-white max-sm:hover:bg-white/10"
              onClick={() => void copySelected()}
            >
              <Copy className="size-5" />
            </Button>
            <Popover open={selectReactOpen} onOpenChange={setSelectReactOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="React to selected messages"
                  title="React"
                  className="size-10 rounded-full text-current max-sm:text-white max-sm:hover:bg-white/10"
                >
                  <Smile className="size-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="z-[120] w-auto rounded-full p-1.5" align="end">
                <div className="flex gap-1">
                  {EMOJI.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => reactSelected(emoji)}
                      className="rounded-full px-1.5 py-1 text-base transition-transform hover:scale-125"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Forward selected messages"
              title="Forward"
              disabled={!selectedText}
              className="size-10 rounded-full text-current max-sm:text-white max-sm:hover:bg-white/10"
              onClick={() => setForwardOpen(true)}
            >
              <Forward className="size-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Delete selected messages for everyone"
              title={
                canDeleteSelected
                  ? "Delete for everyone"
                  : "You can delete your own messages for 2 minutes after sending"
              }
              disabled={!canDeleteSelected}
              className="size-10 rounded-full text-current max-sm:text-white max-sm:hover:bg-white/10"
              onClick={deleteSelected}
            >
              <Trash2 className="size-5" />
            </Button>
          </div>
        ) : (
          <>
            {!inSidebar ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Back to messages"
                className="size-10 shrink-0 rounded-full text-current hover:bg-black/5 hover:text-current sm:hover:bg-accent"
                onClick={() => void navigate({ to: "/messages" })}
              >
                <ArrowLeft className="size-5" />
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (partner)
                  void navigate({ to: "/u/$username", params: { username: partner.username } });
              }}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              disabled={!partner}
              aria-label={partner ? `View @${partner.username}'s profile` : undefined}
            >
              <ProfileAvatar
                photoUrl={partner?.photo_url}
                initials={partner?.username?.slice(0, 2) ?? "··"}
                className="size-10 shrink-0 font-display uppercase"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-semibold">
                  {partner
                    ? `@${partner.username}`
                    : isLoading
                      ? "Loading conversation…"
                      : "Member"}
                  {partner?.verified ? <BadgeCheck className="size-4 text-primary" /> : null}
                  <MembershipBadge tier={partner?.membership_tier} official={partner?.official} />
                </span>
                <span className="flex items-center gap-1.5 text-xs text-zinc-400 sm:text-muted-foreground">
                  {partnerPresence.online ? (
                    <span className="size-2 rounded-full bg-emerald-500" />
                  ) : null}
                  {partner?.official ? "Official Candid account" : partnerActivity}
                </span>
              </span>
            </button>
            <MessageAppearanceSettings
              chat={{
                conversationId: id,
                partner: partner ?? null,
                messages,
                onJumpToMessage: jumpToMessage,
                onOpenImage: setOpenImageUrl,
                onLeave: () => void navigate({ to: "/messages" }),
              }}
              {...(partner?.username ? { contactName: `@${partner.username}` } : {})}
              className="size-10 text-current hover:bg-black/5 hover:text-current"
            />
          </>
        )}
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ChatWallpaper look={appearance} />
        <div
          data-chat-area
          className={cn(
            "relative z-10 h-full min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            inSidebar
              ? cn("space-y-3 pb-4")
              : cn("px-3 py-5 text-white sm:px-6 sm:text-foreground"),
          )}
        >
          <div
            data-chat-list
            className={cn("flex flex-col gap-3", !inSidebar && "mx-auto w-full max-w-2xl")}
          >
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
                <p className="text-sm text-zinc-400 sm:text-muted-foreground">
                  No messages yet — say hello.
                </p>
              </div>
            ) : null}

            <AnimatePresence initial={false}>
              {messages.map((message, messageIndex) => {
                const mine = message.sender_id === user?.uid;
                const nextMessage = messages[messageIndex + 1];
                const showPartnerAvatar =
                  !mine && (!nextMessage || nextMessage.sender_id !== message.sender_id);
                const reactions = Object.entries(message.reactions ?? {}).filter(
                  ([, ids]) => ids.length > 0,
                );
                return (
                  <motion.div
                    key={message.id}
                    id={`msg-${message.id}`}
                    layout
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    data-selected={selected.has(message.id)}
                    role={selecting && !message.is_deleted ? "checkbox" : undefined}
                    aria-checked={
                      selecting && !message.is_deleted ? selected.has(message.id) : undefined
                    }
                    onPointerDown={(event) => startPress(message, event)}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onPointerCancel={cancelPress}
                    onPointerMove={(event) => {
                      if (Math.abs(event.movementX) + Math.abs(event.movementY) > 6) cancelPress();
                    }}
                    onContextMenu={(event) => {
                      if (message.is_deleted) return;
                      event.preventDefault();
                      if (!selecting) toggleSelect(message);
                    }}
                    onClick={() => {
                      if (selecting) toggleSelect(message);
                    }}
                    className={cn(
                      "relative flex [-webkit-touch-callout:none]",
                      mine ? "justify-end" : "justify-start",
                      selecting && "chat-select-row pl-8",
                    )}
                  >
                    {selecting && !message.is_deleted ? (
                      <span
                        className="chat-select-check absolute left-0 top-1/2 -translate-y-1/2"
                        aria-hidden
                      >
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                    ) : null}
                    {!mine && showPartnerAvatar ? (
                      <ProfileAvatar
                        photoUrl={partner?.photo_url}
                        initials={partner?.username?.slice(0, 2) ?? "··"}
                        className="mb-5 mr-2 size-7 shrink-0 self-end sm:hidden"
                      />
                    ) : null}
                    <div
                      className={cn(
                        "flex max-w-[82%] flex-col",
                        mine ? "items-end" : "items-start",
                        selecting && "pointer-events-none",
                      )}
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
                                "candid-message-bubble rounded-[1.35rem] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm sm:rounded-3xl sm:text-sm",
                                mine
                                  ? "candid-message-sent rounded-br-md bg-gradient-to-br from-primary to-lime-400 text-zinc-950 sm:bg-primary sm:text-primary-foreground"
                                  : "candid-message-received rounded-bl-md bg-[#262626] text-white sm:border sm:border-border sm:bg-card sm:text-foreground",
                              )}
                            >
                              <p className="candid-message-text whitespace-pre-wrap">
                                {message.body}
                              </p>
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
                        {mine && message.delivery_state === "not_delivered" ? (
                          <span className="font-medium text-danger">Not delivered</span>
                        ) : null}
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
                          <CheckCheck
                            className={cn("size-3.5", message.read_at && "text-primary")}
                          />
                        ) : null}
                      </div>

                      {!message.is_deleted && reactions.length > 0 ? (
                        <div className={cn("mt-1 flex gap-1", mine ? "justify-end" : "")}>
                          {reactions.map(([emoji, ids]) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() =>
                                toggleReaction.mutate({ message_id: message.id, emoji })
                              }
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
      </div>

      {conversation && !conversation.can_send ? (
        <div className={cn("shrink-0", !inSidebar && "border-t border-border bg-background p-4")}>
          <p className="border-y border-zinc-800 bg-zinc-950 p-4 text-center text-sm text-zinc-400 sm:rounded-2xl sm:border sm:border-border sm:bg-secondary/40 sm:text-muted-foreground">
            {conversation.blocked_reason}
          </p>
        </div>
      ) : (
        <div
          data-chat-composer
          className={cn(
            "shrink-0",
            inSidebar
              ? "glass-card rounded-3xl p-2"
              : "border-t border-zinc-800 bg-zinc-950 px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2 text-white sm:border-border sm:bg-background/95 sm:px-6 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pt-3 sm:text-foreground sm:backdrop-blur",
          )}
        >
          {conversation?.blocked_reason ? (
            <p className="mx-auto mb-2 w-full max-w-2xl px-2 text-xs text-zinc-400 sm:text-center sm:text-muted-foreground">
              {conversation.blocked_reason}
            </p>
          ) : null}
          <div
            className={cn(
              "mx-auto flex w-full max-w-2xl flex-col gap-1.5 rounded-[1.4rem] border border-border/80 bg-card/95 p-2 shadow-[0_8px_28px_rgba(0,0,0,0.12)] transition-colors focus-within:border-primary/45 focus-within:ring-2 focus-within:ring-primary/10",
              inSidebar && "max-w-none",
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
            <div className="flex items-start gap-2 px-1 pt-1">
              <ProfileAvatar
                photoUrl={user?.photoURL}
                initials={(user?.displayName || user?.email || "U").slice(0, 1).toUpperCase()}
                className="mt-1 size-8 shrink-0 ring-2 ring-background"
              />
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && behavior.sendOnEnter) {
                    event.preventDefault();
                    if (draft.trim() || imageReceipt) send.mutate();
                  }
                }}
                rows={1}
                placeholder="Write a message"
                className="max-h-32 min-h-11 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
              />
            </div>
            <div data-composer-controls className="flex items-center gap-1.5 px-1">
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
                variant="ghost"
                size="icon"
                aria-label="Attach image"
                title="Attach image"
                disabled={uploadingImage || send.isPending || !conversation?.can_send}
                onClick={() => imageInputRef.current?.click()}
                className="size-9 shrink-0 rounded-full"
              >
                <ImagePlus className="size-[18px]" />
              </Button>
              <QuickEmojiReactions
                open={composerEmojiOpen}
                onOpenChange={setComposerEmojiOpen}
                onSelect={(emoji) => setDraft((value) => appendEmoji(value, emoji))}
                className="flex items-center"
              />
              <span className="ml-auto mr-2 text-[11px] text-muted-foreground">
                Private message
              </span>
              <Button
                type="button"
                size="icon"
                className="glow-primary size-10 shrink-0 rounded-full"
                data-chat-send
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

      <ChatForwardDialog
        open={forwardOpen}
        onOpenChange={setForwardOpen}
        text={selectedText}
        fromConversationId={id}
        onDone={clearSelection}
      />

      <Dialog open={Boolean(openImageUrl)} onOpenChange={(open) => !open && setOpenImageUrl(null)}>
        <DialogContent
          hideCloseButton
          className="!inset-0 !left-0 !top-0 !h-[100dvh] !max-w-none !translate-x-0 !translate-y-0 rounded-none border-0 bg-black/95 p-4 sm:p-10 lg:p-16"
        >
          <DialogTitle className="sr-only">Shared image</DialogTitle>
          <DialogDescription className="sr-only">
            A full-screen image shared in this conversation.
          </DialogDescription>
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
              {downloadingImage ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Download className="size-5" />
              )}
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
