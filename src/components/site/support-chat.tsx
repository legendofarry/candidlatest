import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getSupportConversation, sendSupportMessage } from "@/lib/support.functions";

const quickPrompts = [
  "I need help with my account",
  "I want to report an issue",
  "How do I post or edit a story?",
  "I have a privacy question",
];

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
    <div
      className={[
        "pointer-events-none fixed right-4 z-[95] md:right-6",
        raised ? "bottom-[calc(env(safe-area-inset-bottom)+6.25rem)]" : "bottom-[calc(env(safe-area-inset-bottom)+1.25rem)]",
      ].join(" ")}
    >
      {open ? (
        <section className="pointer-events-auto fixed inset-0 z-[100] flex h-dvh w-full flex-col overflow-hidden border-0 bg-background/95 shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl animate-in slide-in-from-bottom-8 fade-in duration-300 md:static md:mb-3 md:h-[min(34rem,calc(100vh-7rem))] md:w-[24rem] md:rounded-[28px] md:border md:border-border md:bg-card/95">
          <header className="flex items-center gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur-xl md:rounded-t-[28px]">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/30">
              <MessageCircle className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <strong className="block text-sm font-semibold">Candid support</strong>
              <small className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                Usually replies within a day
              </small>
            </div>
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
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-6" />
              </div>
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
              <div className="border-b border-border p-3">
                <div className="flex flex-wrap gap-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setBody(prompt)}
                      className="rounded-full border border-border bg-secondary/60 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {chat.isLoading ? (
                  <p className="text-sm text-muted-foreground">Opening your chat…</p>
                ) : null}
                {chat.data?.messages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-secondary/30 p-3 text-sm text-muted-foreground">
                    Tell us what you need help with. Your conversation is private to you and the
                    Candid team.
                  </div>
                ) : null}
                {chat.data?.messages.map((message: any) => (
                  <div
                    key={message.id}
                    className={
                      message.sender_type === "user"
                        ? "ml-8 rounded-[20px] rounded-br-md bg-primary p-3 text-sm text-primary-foreground shadow-sm"
                        : "mr-8 rounded-[20px] rounded-bl-md border border-border bg-secondary/70 p-3 text-sm text-foreground"
                    }
                  >
                    {message.body}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <form
                onSubmit={submit}
                className="flex gap-2 border-t border-border bg-card/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:rounded-b-[28px]"
              >
                <input
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={4000}
                  placeholder="Write a message…"
                  className="min-w-0 flex-1 rounded-full border border-border bg-secondary px-4 py-2.5 text-base outline-none transition-colors focus:border-primary md:text-sm"
                />
                <Button
                  size="icon"
                  type="submit"
                  disabled={!body.trim() || sendMutation.isPending}
                  aria-label="Send message"
                  className="rounded-full shadow-lg shadow-primary/25"
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
        className={[
          "pointer-events-auto size-14 rounded-[1.45rem] shadow-[0_20px_45px_rgba(153,255,116,0.38)] transition-all duration-200 active:scale-95",
          open ? "hidden md:inline-flex" : "inline-flex",
        ].join(" ")}
        aria-label="Open support chat"
      >
        <MessageCircle className="size-5" />
      </Button>
    </div>
  );
}
