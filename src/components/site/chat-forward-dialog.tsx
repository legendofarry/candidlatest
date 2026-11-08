import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
import { getConversations, postMessage } from "@/lib/messaging.functions";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { notify } from "@/lib/notifications-store";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** Pick a conversation and send the selected text messages there. */
export function ChatForwardDialog({
  open,
  onOpenChange,
  text,
  fromConversationId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  fromConversationId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchConversations = useServerFn(getConversations);
  const send = useServerFn(postMessage);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["forward-targets"],
    queryFn: () => fetchConversations({ data: { limit: 50, cursor: null, archived: false } }),
    enabled: open,
  });
  const forward = useMutation({
    mutationFn: (conversationId: string) => send({ data: { conversation_id: conversationId, body: text.slice(0, 4000) } }),
    onMutate: (conversationId) => setSendingTo(conversationId),
    onSuccess: async (_result, conversationId) => {
      notify.success("Forwarded");
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      onOpenChange(false);
      onDone();
    },
    onError: (error) => notify.error(error instanceof Error ? error.message : "Could not forward this message."),
    onSettled: () => setSendingTo(null),
  });
  const items = (list.data?.items ?? []).filter((item: { id: string }) => item.id !== fromConversationId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] gap-3 overflow-hidden">
        <DialogTitle>Forward to…</DialogTitle>
        <DialogDescription className="line-clamp-2">{text.length > 120 ? `${text.slice(0, 120)}…` : text}</DialogDescription>
        <div className="-mx-2 max-h-[52dvh] overflow-y-auto px-2">
          {list.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">You have no other conversations to forward to.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item: { id: string; with: { username: string; photo_url?: string | null } | null }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={forward.isPending}
                    onClick={() => forward.mutate(item.id)}
                    className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-secondary/60 disabled:opacity-60"
                  >
                    <ProfileAvatar photoUrl={item.with?.photo_url} initials={item.with?.username?.slice(0, 2) ?? "··"} className="size-9 shrink-0 font-display uppercase" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.with ? `@${item.with.username}` : "Member"}</span>
                    {sendingTo === item.id ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 text-muted-foreground" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
