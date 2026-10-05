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
        "pointer-events-none fixed right-4 z-[95] sm:right-6",
        raised
          ? "bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] md:bottom-6"
          : "bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] md:bottom-6",
      ].join(" ")}
    >
      {open ? (
        <section
          id="support-chat-panel"
          aria-label="Candid support chat"
          className="pointer-events-auto fixed inset-0 z-[100] flex h-dvh w-full flex-col overflow-hidden bg-background/95 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl animate-in slide-in-from-bottom-8 fade-in duration-300 md:static md:mb-4 md:h-[min(43rem,calc(100dvh-8rem))] md:w-[min(27rem,calc(100vw-3rem))] md:rounded-[30px] md:border md:border-border/70 md:bg-card/95 md:shadow-[0_28px_100px_rgba(0,0,0,0.36)]"
        >
          <header className="relative flex shrink-0 items-center gap-3 overflow-hidden border-b border-border/70 bg-card/75 px-5 py-4 backdrop-blur-xl md:px-5 md:py-5">
            <div className="pointer-events-none absolute -right-8 -top-16 size-40 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative flex size-12 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground shadow-[0_10px_28px_rgba(153,255,116,0.2)] ring-1 ring-primary/20">
              <MessageCircle className="size-[21px]" />
              <span className="absolute -bottom-1 -right-1 size-3.5 rounded-full border-[3px] border-card bg-emerald-400" />
            </div>
            <div className="relative min-w-0 flex-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                Here to help
              </span>
              <strong className="block truncate font-display text-base font-semibold tracking-tight">
                Candid support
              </strong>
              <small className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
                Usually replies within a day
              </small>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="relative size-10 shrink-0 rounded-2xl border border-border/70 bg-background/65 text-muted-foreground transition-all hover:border-border hover:bg-secondary hover:text-foreground"
              aria-label="Close support chat"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </header>

          {!user ? (
            <div className="flex flex-1 flex-col justify-center overflow-y-auto p-6 text-center md:p-8">
              <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-[22px] border border-primary/15 bg-primary/10 text-primary shadow-inner shadow-primary/10">
                <Sparkles className="size-6" />
              </div>
              <p className="font-display text-xl font-semibold tracking-tight">
                Let’s get you sorted
              </p>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
                Sign in to start a private conversation with the Candid team.
              </p>
              <Button asChild className="mx-auto mt-6 h-11 rounded-2xl px-6 shadow-lg shadow-primary/15">
                <Link to="/auth" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
              </Button>
              <p className="mt-4 text-xs text-muted-foreground">
                Need help without an account?{" "}
                <Link
                  to="/support"
                  onClick={() => setOpen(false)}
                  className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-primary"
                >
                  Visit support
                </Link>
              </p>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-border/70 bg-secondary/20 px-4 py-3.5 md:px-5">
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Start with a topic
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                    Quick replies
                  </span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible md:pb-0">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setBody(prompt)}
                      className="shrink-0 rounded-full border border-border/80 bg-background/80 px-3 py-2 text-xs text-muted-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 md:px-3 md:py-1.5"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_rgba(153,255,116,0.06),_transparent_55%)] px-4 py-5 md:px-5">
                {chat.isLoading ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/75 p-4 text-sm text-muted-foreground shadow-sm">
                    <span className="size-2 animate-pulse rounded-full bg-primary" />
                    Connecting to support…
                  </div>
                ) : null}
                {chat.data?.messages.length === 0 ? (
                  <div className="mx-auto mt-4 max-w-sm rounded-[24px] border border-border/70 bg-card/75 p-5 text-center shadow-sm backdrop-blur-sm">
                    <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Sparkles className="size-4" />
                    </div>
                    <p className="text-sm font-semibold">Your conversation starts here</p>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                      Tell us what you need. This private chat is only visible to you and the
                      Candid team.
                    </p>
                  </div>
                ) : null}
                {chat.data?.messages.map((message: any) => (
                  <div
                    key={message.id}
                    className={
                      message.sender_type === "user"
                        ? "ml-auto max-w-[88%] rounded-[22px] rounded-br-md bg-gradient-to-br from-primary to-primary/85 px-4 py-3 text-sm leading-6 text-primary-foreground shadow-[0_8px_24px_rgba(153,255,116,0.16)]"
                        : "mr-auto max-w-[88%] rounded-[22px] rounded-bl-md border border-border/70 bg-card/85 px-4 py-3 text-sm leading-6 text-foreground shadow-sm backdrop-blur-sm"
                    }
                  >
                    {message.body}
                  </div>
                ))}
                {sendMutation.isPending ? (
                  <div className="mr-auto flex items-center gap-1.5 rounded-full border border-border/70 bg-card/85 px-4 py-3 shadow-sm">
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  </div>
                ) : null}
                <div ref={bottomRef} />
              </div>
              <form
                onSubmit={submit}
                className="shrink-0 border-t border-border/70 bg-card/85 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:p-4 md:pb-4"
              >
                <div className="flex items-center gap-2 rounded-[22px] border border-border/80 bg-background p-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.08)] transition-all focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
                  <input
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    maxLength={4000}
                    placeholder="Write a message…"
                    className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground/70 md:text-sm"
                  />
                  <Button
                    size="icon"
                    type="submit"
                    disabled={!body.trim() || sendMutation.isPending}
                    aria-label="Send message"
                    className="size-10 shrink-0 rounded-[16px] shadow-lg shadow-primary/20 transition-transform active:scale-95"
                  >
                    <Send className="size-4" />
                  </Button>
                </div>
                <p className="mt-2 hidden text-center text-[10px] text-muted-foreground/70 md:block">
                  Private conversation · Candid support
                </p>
              </form>
            </>
          )}
        </section>
      ) : null}
      <Button
        onClick={() => setOpen((value) => !value)}
        size="default"
        aria-expanded={open}
        aria-controls="support-chat-panel"
        className={[
          "group pointer-events-auto relative h-14 rounded-[20px] border border-primary-foreground/15 bg-gradient-to-br from-primary via-primary to-primary/80 px-0 text-primary-foreground shadow-[0_16px_42px_rgba(153,255,116,0.28)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_52px_rgba(153,255,116,0.38)] active:translate-y-0 active:scale-[0.98] sm:h-[3.75rem] sm:rounded-[22px]",
          open ? "hidden md:inline-flex md:px-5" : "inline-flex md:px-5",
        ].join(" ")}
        aria-label={open ? "Close support chat" : "Open support chat"}
      >
        <span className="relative flex size-14 shrink-0 items-center justify-center sm:size-11">
          <MessageCircle className="size-[21px] transition-transform duration-300 group-hover:scale-110" />
          <span className="absolute right-[13px] top-[13px] size-2 rounded-full border-2 border-primary bg-emerald-300 sm:right-1 sm:top-1" />
        </span>
        <span className="hidden pr-1 text-left sm:block">
          <span className="block text-sm font-semibold leading-4">
            {open ? "Close chat" : "Chat with us"}
          </span>
          <span className="mt-1 block text-[10px] font-medium text-primary-foreground/75">
            {open ? "Minimize this window" : "We’re here to help"}
          </span>
        </span>
      </Button>
    </div>
  );
}
