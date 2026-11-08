import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  BellOff,
  CornerDownLeft,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Pin,
  Search,
  ShieldBan,
  Trash2,
  Vibrate,
} from "lucide-react";
import {
  getConversationPreferences,
  getPrivacySettings,
  toggleBlockAccount,
  updateConversationPreference,
  updatePrivacySettings,
} from "@/lib/messaging.functions";
import type { ChatParticipant, MessageRecord } from "@/lib/messaging.server";
import type { ChatBehavior } from "@/lib/message-appearance";
import { notify } from "@/lib/notifications-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Group, Row, SectionHeading, Segmented, ToggleRow } from "./controls";

export type HubChat = {
  conversationId: string;
  partner: ChatParticipant | null;
  messages: MessageRecord[];
  onJumpToMessage: (messageId: string) => void;
  onOpenImage: (url: string) => void;
  onLeave: () => void;
};

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi;

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/* ─────────── Chat behaviour ─────────── */

export function BehaviourSection({ behavior, onBehavior }: { behavior: ChatBehavior; onBehavior: (partial: Partial<ChatBehavior>) => void }) {
  return (
    <div className="space-y-5">
      <SectionHeading title="Typing & sending" hint="Applies to every chat on all your devices." />
      <Group>
        <ToggleRow
          icon={<CornerDownLeft className="size-4" />}
          label="Enter sends the message"
          description="Turn off to use Enter for a new line and send with the button."
          checked={behavior.sendOnEnter}
          onChange={(sendOnEnter) => onBehavior({ sendOnEnter })}
        />
        <ToggleRow
          icon={<Vibrate className="size-4" />}
          label="Vibration feedback"
          description="A light buzz when you select messages or send. Phones only."
          checked={behavior.haptics}
          onChange={(haptics) => onBehavior({ haptics })}
        />
      </Group>
    </div>
  );
}

/* ─────────── Conversation state (mute / pin / archive / delete) ─────────── */

function useConversationState(conversationId: string | null) {
  const queryClient = useQueryClient();
  const fetchPreferences = useServerFn(getConversationPreferences);
  const applyAction = useServerFn(updateConversationPreference);
  const query = useQuery({
    queryKey: ["conversation-preferences", conversationId],
    queryFn: () => fetchPreferences({ data: { conversation_id: conversationId! } }),
    enabled: Boolean(conversationId),
  });
  const mutation = useMutation({
    mutationFn: (action: "archive" | "unarchive" | "mute" | "unmute" | "pin" | "unpin" | "delete") =>
      applyAction({ data: { conversation_id: conversationId!, action } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["conversation-preferences", conversationId] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) => notify.error(errorText(error, "Could not update this conversation.")),
  });
  return { state: query.data, loading: query.isLoading, mutation };
}

export function NotificationsSection({ chat }: { chat: HubChat | null }) {
  const { state, loading, mutation } = useConversationState(chat?.conversationId ?? null);
  if (!chat) {
    return (
      <div className="space-y-4">
        <SectionHeading title="Notifications" />
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Mute a conversation from inside it: open the chat, tap the settings icon and choose Notifications.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <SectionHeading title="Notifications" hint={chat.partner ? `For your chat with @${chat.partner.username}` : "For this chat"} />
      <Group>
        <ToggleRow
          icon={<BellOff className="size-4" />}
          label="Mute this chat"
          description="You will still get the messages, just without alerts. Muted chats show a muted icon in your inbox."
          checked={state?.muted === true}
          disabled={loading || mutation.isPending}
          onChange={(muted) => mutation.mutate(muted ? "mute" : "unmute")}
        />
      </Group>
    </div>
  );
}

/* ─────────── Privacy & safety ─────────── */

export function PrivacySection({ chat, onClose }: { chat: HubChat | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fetchPrivacy = useServerFn(getPrivacySettings);
  const savePrivacy = useServerFn(updatePrivacySettings);
  const toggleBlock = useServerFn(toggleBlockAccount);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const privacy = useQuery({ queryKey: ["privacy-settings", "hub"], queryFn: () => fetchPrivacy() });
  const whoMutation = useMutation({
    mutationFn: (who: "everyone" | "followers" | "nobody") => savePrivacy({ data: { who_can_message: who } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["privacy-settings"] }),
    onError: (error) => notify.error(errorText(error, "Could not save this setting.")),
  });
  const blockMutation = useMutation({
    mutationFn: (userId: string) => toggleBlock({ data: { user_id: userId } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["privacy-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      notify.success(result && "blocked" in result && result.blocked ? "Member blocked" : "Member unblocked");
      setConfirmBlock(false);
      onClose();
    },
    onError: (error) => notify.error(errorText(error, "Could not update block.")),
  });
  const partner = chat?.partner ?? null;
  const isBlocked = Boolean(partner && privacy.data?.blocked?.some((member: { id: string }) => member.id === partner.id));
  const canBlock = Boolean(partner && !partner.official);

  return (
    <div className="space-y-6">
      <section>
        <SectionHeading title="Who can message me" hint="Applies to your whole account." />
        <Segmented
          label="Who can message me"
          value={(privacy.data?.who_can_message ?? "everyone") as "everyone" | "followers" | "nobody"}
          onChange={(value) => whoMutation.mutate(value)}
          options={[
            { value: "everyone", label: "Everyone", disabled: privacy.isLoading },
            { value: "followers", label: "Followers", disabled: privacy.isLoading },
            { value: "nobody", label: "Nobody", disabled: privacy.isLoading },
          ]}
        />
      </section>

      {chat && partner ? (
        <section>
          <SectionHeading title="This member" hint={`@${partner.username}`} />
          <Group>
            <Row
              icon={<ShieldBan className="size-4" />}
              label={isBlocked ? "Unblock this member" : "Block this member"}
              description={
                canBlock
                  ? isBlocked
                    ? "They will be able to message you again."
                    : "Neither of you can message the other. You can unblock any time."
                  : "Official Candid accounts cannot be blocked."
              }
              danger={!isBlocked}
              disabled={!canBlock || blockMutation.isPending}
              onClick={canBlock ? () => (isBlocked ? blockMutation.mutate(partner.id) : setConfirmBlock(true)) : undefined}
            />
          </Group>
        </section>
      ) : null}

      <AlertDialog open={confirmBlock} onOpenChange={setConfirmBlock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block @{partner?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              You will not be able to message each other. They are not told that you blocked them, and you can unblock them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => partner && blockMutation.mutate(partner.id)}>Block</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─────────── Chat tools ─────────── */

function snippet(body: string, query: string) {
  const index = body.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, index - 24);
  return { before: (start > 0 ? "…" : "") + body.slice(start, index), match: body.slice(index, index + query.length), after: body.slice(index + query.length, index + query.length + 48) };
}

export function ToolsSection({ chat, onClose }: { chat: HubChat | null; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { state, loading, mutation } = useConversationState(chat?.conversationId ?? null);
  const messages = chat?.messages ?? [];

  const results = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    return messages.filter((m) => !m.is_deleted && m.body.toLowerCase().includes(q.toLowerCase())).slice(-30).reverse();
  }, [messages, query]);
  const images = useMemo(() => messages.filter((m) => !m.is_deleted && m.image?.delivery_url), [messages]);
  const links = useMemo(() => {
    const seen = new Set<string>();
    const found: { url: string; at: string }[] = [];
    for (const message of messages) {
      if (message.is_deleted) continue;
      for (const url of message.body.match(URL_PATTERN) ?? []) {
        if (!seen.has(url)) {
          seen.add(url);
          found.push({ url, at: message.created_at });
        }
      }
    }
    return found.reverse();
  }, [messages]);

  if (!chat) {
    return (
      <div className="space-y-4">
        <SectionHeading title="Chat tools" />
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Search, shared media and links, pin and archive are available inside a conversation. Open a chat and tap the settings icon.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <section>
        <SectionHeading title="Search this chat" hint="Searches the messages loaded on screen. Load older messages to look further back." />
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search messages"
            className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        {query.trim().length >= 2 ? (
          results.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No messages match “{query.trim()}”.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {results.map((message) => {
                const parts = snippet(message.body, query.trim());
                return (
                  <li key={message.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        window.setTimeout(() => chat.onJumpToMessage(message.id), 250);
                      }}
                      className="block w-full px-3.5 py-2.5 text-left hover:bg-secondary/60"
                    >
                      <span className="block text-sm">
                        {parts.before}
                        <mark className="rounded bg-primary/25 px-0.5 text-foreground">{parts.match}</mark>
                        {parts.after}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{new Date(message.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </section>

      <section>
        <SectionHeading title="Shared media" hint={images.length ? `${images.length} image${images.length === 1 ? "" : "s"}` : undefined} />
        {images.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No images shared in the loaded messages yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {images.slice(-24).reverse().map((message) => (
              <button
                key={message.id}
                type="button"
                aria-label="Open shared image"
                onClick={() => {
                  onClose();
                  window.setTimeout(() => chat.onOpenImage(message.image!.delivery_url), 250);
                }}
                className="group relative aspect-square overflow-hidden rounded-xl bg-secondary"
              >
                <img src={message.image!.delivery_url} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
                <ImageIcon className="absolute bottom-1 right-1 size-3.5 text-white drop-shadow" />
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeading title="Links" hint={links.length ? `${links.length} shared` : undefined} />
        {links.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No links in the loaded messages.</p>
        ) : (
          <Group>
            {links.slice(0, 20).map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-secondary/60">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground"><Link2 className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{link.url.replace(/^https?:\/\//, "")}</span>
                  <span className="block text-[11px] text-muted-foreground">{new Date(link.at).toLocaleDateString([], { dateStyle: "medium" })}</span>
                </span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </Group>
        )}
      </section>

      <section>
        <SectionHeading title="Organise" />
        <Group>
          <ToggleRow icon={<Pin className="size-4" />} label="Pin to top" description="Keeps this chat at the top of your inbox." checked={state?.pinned === true} disabled={loading || mutation.isPending} onChange={(pinned) => mutation.mutate(pinned ? "pin" : "unpin")} />
          <ToggleRow icon={<Archive className="size-4" />} label="Archive" description="Moves this chat out of your main inbox. New messages bring it back." checked={state?.archived === true} disabled={loading || mutation.isPending} onChange={(archived) => mutation.mutate(archived ? "archive" : "unarchive")} />
          <Row icon={<Trash2 className="size-4" />} label="Delete this conversation" description="Removes it from your inbox. The other person keeps their copy." danger disabled={mutation.isPending} onClick={() => setConfirmDelete(true)} />
        </Group>
      </section>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>It disappears from your inbox. The other person still has their copy, and a new message from them would start it again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                mutation.mutate("delete", {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    onClose();
                    chat.onLeave();
                  },
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
