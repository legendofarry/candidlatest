import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AtSign, Check, Globe2, Loader2, Send, Smile, VenetianMask } from "lucide-react";
import type { User } from "firebase/auth";
import { MentionTextarea } from "@/components/site/mention-textarea";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { appendEmoji, QUICK_EMOJIS } from "@/lib/composer-utils";
import { cn } from "@/lib/utils";

const MIN_LENGTH = 2;
const SPRING = { type: "spring", stiffness: 420, damping: 30 } as const;

function buzz() {
  try {
    navigator.vibrate?.(10);
  } catch {
    /* haptics are optional */
  }
}

/** Progress ring that wraps the send button and fills as you approach the limit. */
function Ring({ progress, tone }: { progress: number; tone: string }) {
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 44 44" className="pointer-events-none absolute inset-0 size-full -rotate-90" aria-hidden>
      <circle cx="22" cy="22" r={radius} fill="none" strokeWidth="2" className="stroke-border/60" />
      <motion.circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        animate={{ strokeDashoffset: circumference * (1 - Math.min(1, progress)) }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={tone}
      />
    </svg>
  );
}

/**
 * A quiet, single-line composer that opens up while you use it. Tap the avatar to flip between
 * your public face and a ghost; the whole field shifts mood so you always know how you're posting.
 */
export function CommentComposer({
  user,
  value,
  onValueChange,
  anonymous,
  onToggleAnonymous,
  onSubmit,
  pending,
  textareaRef,
  banner,
  placeholder,
  maxLength = 2000,
  rows = 1,
}: {
  user: Pick<User, "photoURL" | "displayName" | "email">;
  value: string;
  onValueChange: (value: string | ((previous: string) => string)) => void;
  anonymous: boolean;
  onToggleAnonymous: () => void;
  onSubmit: () => void;
  pending: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Context shown above the field, such as who you are replying to. */
  banner?: ReactNode;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}) {
  const still = Boolean(useReducedMotion());
  const rootRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const wasPending = useRef(false);

  const initial = (user.displayName || user.email || "U").slice(0, 1).toUpperCase();
  const trimmed = value.trim().length;
  const ready = trimmed >= MIN_LENGTH && !pending;
  const active = focused || trayOpen || value.length > 0;
  const progress = value.length / maxLength;
  const ringTone =
    progress >= 1 ? "stroke-destructive" : progress >= 0.9 ? "stroke-amber-500" : anonymous ? "stroke-violet-500" : "stroke-primary";

  // Grow with the text, up to a comfortable height.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 168)}px`;
  }, [value, textareaRef]);

  // A brief tick once a comment has gone through.
  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    if (value === "") {
      setSent(true);
      setTrayOpen(false);
      const timer = window.setTimeout(() => setSent(false), 1100);
      return () => window.clearTimeout(timer);
    }
  }, [pending, value]);

  function focusEnd() {
    requestAnimationFrame(() => {
      const input = textareaRef.current;
      if (!input) return;
      const end = input.value.length;
      input.focus();
      input.setSelectionRange(end, end);
    });
  }

  function flip() {
    buzz();
    onToggleAnonymous();
  }

  const lineGradient = anonymous
    ? "linear-gradient(90deg, #8b5cf6, #6366f1, #8b5cf6)"
    : "linear-gradient(90deg, var(--primary), #14b8a6, var(--primary))";

  return (
    <div
      ref={rootRef}
      data-anon={anonymous}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      className="relative"
    >
      <AnimatePresence initial={false}>
        {banner ? (
          <motion.div
            key="banner"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="overflow-hidden"
          >
            <div className="pb-2.5">{banner}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Mood: a soft wash that appears when posting anonymously. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-x-4 -inset-y-3 bg-[radial-gradient(60%_90%_at_12%_0%,rgba(139,92,246,0.14),transparent)]"
        initial={false}
        animate={{ opacity: anonymous ? 1 : 0 }}
        transition={{ duration: 0.4 }}
      />

      <div className="relative flex items-end gap-3">
        <button
          type="button"
          onClick={flip}
          onMouseDown={(event) => event.preventDefault()}
          aria-pressed={anonymous}
          aria-label={anonymous ? "Switch to your public identity" : "Switch to anonymous"}
          className="group relative mb-1 size-9 shrink-0 rounded-full outline-none [perspective:400px] focus-visible:ring-2 focus-visible:ring-ring"
        >
          <motion.span
            className="absolute inset-0 block [transform-style:preserve-3d]"
            initial={false}
            animate={{ rotateY: anonymous ? 180 : 0 }}
            transition={still ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 20 }}
          >
            <span className="absolute inset-0 overflow-hidden rounded-full [backface-visibility:hidden]">
              <ProfileAvatar
                photoUrl={user.photoURL}
                initials={initial}
                className="size-full"
                fallbackClassName="bg-primary/10 text-primary"
              />
            </span>
            <span className="absolute inset-0 grid place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white [backface-visibility:hidden] [transform:rotateY(180deg)]">
              <VenetianMask className="size-[18px]" />
            </span>
          </motion.span>
        </button>

        <div className="min-w-0 flex-1">
          <MentionTextarea
            textareaRef={textareaRef}
            rows={rows}
            maxLength={maxLength}
            value={value}
            onValueChange={onValueChange}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && ready) {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder={
              placeholder ?? (anonymous ? "Say it anonymously…" : "Add a comment…")
            }
            className="min-h-9 resize-none rounded-none border-0 bg-transparent px-0 py-2 text-[15px] leading-snug shadow-none focus-visible:ring-0"
          />
          {/* A hairline that draws itself in from the centre while you write. */}
          <div className="relative h-px w-full bg-border/70">
            <motion.div
              aria-hidden
              className="absolute inset-x-0 -top-px h-[2px] origin-center rounded-full"
              style={{
                backgroundImage: lineGradient,
                backgroundSize: "200% 100%",
                ...(anonymous
                  ? {
                      WebkitMaskImage:
                        "repeating-linear-gradient(90deg, #000 0 8px, transparent 8px 12px)",
                      maskImage: "repeating-linear-gradient(90deg, #000 0 8px, transparent 8px 12px)",
                    }
                  : null),
              }}
              initial={false}
              animate={{
                scaleX: active ? 1 : 0,
                opacity: active ? 1 : 0,
                backgroundPositionX: still || !focused ? "0%" : ["0%", "200%"],
              }}
              transition={{
                scaleX: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: 0.2 },
                backgroundPositionX: { duration: 3, repeat: Infinity, ease: "linear" },
              }}
            />
          </div>
        </div>

        <div className="relative mb-0.5 size-10 shrink-0">
          <AnimatePresence initial={false}>
            {ready || pending || sent ? (
              <motion.button
                key="send"
                type="button"
                disabled={!ready}
                onClick={() => {
                  buzz();
                  onSubmit();
                }}
                aria-label="Post comment"
                initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.4, opacity: 0 }}
                whileTap={{ scale: 0.88 }}
                transition={SPRING}
                className={cn(
                  "absolute inset-1 grid place-items-center rounded-full text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  anonymous ? "bg-gradient-to-br from-violet-500 to-indigo-600" : "bg-primary",
                  !ready && "cursor-default",
                )}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {sent ? (
                    <motion.span key="done" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
                      <Check className="size-[18px]" strokeWidth={3} />
                    </motion.span>
                  ) : pending ? (
                    <motion.span key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Loader2 className="size-[18px] animate-spin" />
                    </motion.span>
                  ) : (
                    <motion.span key="send" initial={{ x: -6, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 8, opacity: 0 }}>
                      <Send className="size-[17px]" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            ) : null}
          </AnimatePresence>
          {trimmed > 0 && !sent ? <Ring progress={progress} tone={ringTone} /> : null}
        </div>
      </div>

      {/* Emoji tray: expands in the flow so nothing is clipped. */}
      <AnimatePresence initial={false}>
        {trayOpen ? (
          <motion.div
            key="tray"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="relative overflow-hidden"
            onMouseDown={(event) => event.preventDefault()}
          >
            <div role="group" aria-label="Quick emoji" className="flex items-center gap-1 pb-1 pl-12 pt-2">
              {QUICK_EMOJIS.map((emoji, index) => (
                <motion.button
                  key={emoji}
                  type="button"
                  aria-label={`Insert ${emoji}`}
                  initial={{ opacity: 0, y: 8, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ ...SPRING, delay: still ? 0 : index * 0.03 }}
                  whileHover={{ scale: 1.18 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={() => {
                    onValueChange((previous) => appendEmoji(previous, emoji));
                    focusEnd();
                  }}
                  className="grid size-9 place-items-center rounded-full text-xl"
                >
                  {emoji}
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Tools slide in once you engage, and rest out of sight otherwise. */}
      <AnimatePresence initial={false}>
        {active ? (
          <motion.div
            key="tools"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="relative overflow-hidden"
            onMouseDown={(event) => event.preventDefault()}
          >
            <div className="flex items-center gap-1 pb-0.5 pl-12 pt-1.5">
              <button
                type="button"
                aria-label={trayOpen ? "Hide emoji" : "Insert emoji"}
                aria-expanded={trayOpen}
                onClick={() => setTrayOpen((open) => !open)}
                className={cn(
                  "grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  trayOpen && "bg-muted text-foreground",
                )}
              >
                <Smile className="size-[18px]" />
              </button>
              <button
                type="button"
                aria-label="Mention someone"
                onClick={() => {
                  onValueChange((previous) => appendEmoji(previous, "@"));
                  focusEnd();
                }}
                className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <AtSign className="size-[18px]" />
              </button>

              <button
                type="button"
                onClick={flip}
                aria-pressed={anonymous}
                className={cn(
                  "ml-1 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  anonymous
                    ? "bg-violet-500/10 text-violet-600 dark:text-violet-300"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {anonymous ? <VenetianMask className="size-3.5" /> : <Globe2 className="size-3.5" />}
                <span className="relative inline-grid overflow-hidden" aria-live="polite">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={anonymous ? "anon" : "public"}
                      initial={{ y: 12, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -12, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {anonymous ? "Anonymous" : "Public"}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </button>

              <AnimatePresence initial={false}>
                {progress >= 0.8 ? (
                  <motion.span
                    key="count"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={cn(
                      "ml-auto pr-1 text-xs tabular-nums",
                      progress >= 1 ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {(maxLength - value.length).toLocaleString()} left
                  </motion.span>
                ) : (
                  <span key="hint" className="ml-auto hidden pr-1 text-[11px] text-muted-foreground/70 md:inline">
                    Ctrl + Enter to post
                  </span>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
