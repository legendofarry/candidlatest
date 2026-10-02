import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Send, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getSupportConversation, sendSupportMessage } from "@/lib/support.functions";

export function SupportChat({ raised = false }: { raised?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const fetchConversation = useServerFn(getSupportConversation);
  const send = useServerFn(sendSupportMessage);
  const chat = useQuery({
    queryKey: ["support-conversation", user?.uid],
    queryFn: () => fetchConversation(),
    enabled: open && Boolean(user),
    refetchInterval: open ? 15_000 : false,
  });
  const sendMutation = useMutation({
    mutationFn: () => send({ data: { body } }),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["support-conversation", user?.uid] });
    },
  });

  useEffect(
    () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
    [chat.data?.messages.length, open],
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (body.trim() && !sendMutation.isPending) sendMutation.mutate();
  }

  return (
    <div className={`fixed right-4 z-[95] md:bottom-6 md:right-6 ${raised ? "bottom-28" : "bottom-6"}`}>
      {open ? (
        <section className="fixed inset-0 z-[100] flex h-dvh w-full flex-col overflow-hidden bg-background animate-in slide-in-from-bottom-8 fade-in duration-300 md:static md:mb-3 md:h-[min(32rem,calc(100vh-7rem))] md:w-[22rem] md:rounded-3xl md:border md:border-border md:shadow-2xl">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <MessageCircle className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm">Candid support</strong>
              <small className="flex items-center gap-1.5 text-muted-foreground"><span className="size-1.5 animate-pulse rounded-full bg-verified" /> We usually reply within a day.</small>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 rounded-full bg-secondary"
              aria-label="Close support chat"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </header>
          {!user ? (
            <div className="flex flex-1 flex-col justify-center p-5 text-center">
              <p className="font-medium">Sign in to start a live chat</p>
              <p className="mt-2 text-sm text-muted-foreground">
                You can still send a support ticket without an account.
              </p>
              <Button asChild className="mt-5">
                <Link to="/auth" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {chat.isLoading ? (
                  <p className="text-sm text-muted-foreground">Opening your chat…</p>
                ) : null}
                {chat.data?.messages.length === 0 ? (
                  <p className="rounded-2xl bg-secondary p-3 text-sm text-muted-foreground">
                    Tell us what you need help with. Your conversation is private to you and the
                    Candid team.
                  </p>
                ) : null}
                {chat.data?.messages.map((message: any) => (
                  <div
                    key={message.id}
                    className={
                      message.sender_type === "user"
                        ? "ml-8 rounded-2xl rounded-br-sm bg-primary p-3 text-sm text-primary-foreground"
                        : "mr-8 rounded-2xl rounded-bl-sm bg-secondary p-3 text-sm"
                    }
                  >
                    {message.body}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={submit} className="flex gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <input
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={4000}
                  placeholder="Write a message…"
                  className="min-w-0 flex-1 rounded-full bg-secondary px-4 py-2.5 text-base outline-none md:text-sm"
                />
                <Button
                  size="icon"
                  type="submit"
                  disabled={!body.trim() || sendMutation.isPending}
                  aria-label="Send message"
                >
                  <Send className="size-4" />
                </Button>
              </form>
            </>
          )}
        </section>
      ) : null}
      <Button
        onClick={() => setOpen((value) => !value)}
        size="icon"
        className={`size-12 rounded-full shadow-lg shadow-primary/30 transition-transform active:scale-90 ${open ? "hidden md:inline-flex" : ""}`}
        aria-label="Open support chat"
      >
        <MessageCircle className="size-5" />
      </Button>
    </div>
  );
}
