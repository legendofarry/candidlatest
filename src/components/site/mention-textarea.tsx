import { useEffect, useRef, useState, type ChangeEvent, type ComponentProps } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { getMentionSuggestions } from "@/lib/messaging.functions";
import { cn } from "@/lib/utils";

type MentionUser = { username: string; photoUrl: string | null };
type ActiveMention = { query: string; start: number; end: number };

/** Textarea with a small, debounced account picker for @mentions. */
export function MentionTextarea({
  value,
  onValueChange,
  className,
  ...props
}: Omit<ComponentProps<typeof Textarea>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { user } = useAuth();
  const search = useServerFn(getMentionSuggestions);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeMention || !user || activeMention.query.length < 2) {
      setUsers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void search({ data: { query: activeMention.query } })
        .then((result) => {
          if (!cancelled) setUsers(result.users as MentionUser[]);
        })
        .catch(() => {
          if (!cancelled) setUsers([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeMention, search, user]);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget;
    const caret = textarea.selectionStart;
    const beforeCaret = textarea.value.slice(0, caret);
    const match = beforeCaret.match(/(?:^|\s)@([a-z0-9._]{2,20})$/i);
    onValueChange(textarea.value);
    if (!match) {
      setActiveMention(null);
      return;
    }
    setActiveMention({
      query: match[1]!.toLowerCase(),
      start: caret - match[1]!.length - 1,
      end: caret,
    });
  }

  function choose(user: MentionUser) {
    if (!activeMention) return;
    const replacement = `@${user.username} `;
    const next = `${value.slice(0, activeMention.start)}${replacement}${value.slice(activeMention.end)}`;
    const caret = activeMention.start + replacement.length;
    onValueChange(next);
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(caret, caret);
      inputRef.current?.focus();
    });
    setActiveMention(null);
  }

  return (
    <div className="relative min-w-0 flex-1">
      {activeMention && user ? (
        <div
          role="listbox"
          aria-label="Mention an account"
          className="absolute inset-x-0 bottom-full z-50 mb-2 max-h-56 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl"
        >
          {loading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Finding accounts…</p>
          ) : users.length ? (
            users.map((suggestion) => (
              <button
                key={suggestion.username}
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(suggestion)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-secondary focus-visible:bg-secondary"
              >
                <ProfileAvatar
                  photoUrl={suggestion.photoUrl}
                  initials={suggestion.username.slice(0, 1).toUpperCase()}
                  className="size-7 shrink-0 text-[10px]"
                />
                <span className="truncate">@{suggestion.username}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matching accounts.</p>
          )}
        </div>
      ) : null}
      <Textarea
        {...props}
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={(event) => {
          if (event.key === "Escape") setActiveMention(null);
          props.onKeyDown?.(event);
        }}
        className={cn(className)}
      />
    </div>
  );
}

/** Render stored @handles as links while leaving all other text untouched. */
export function MentionText({ text, linkMentions = true }: { text: string; linkMentions?: boolean }) {
  const parts = text.split(/(^|[\s(])(@[a-z0-9_]+(?:\.[a-z0-9_]+)*)/gi);
  return (
    <>
      {parts.map((part, index) => {
        if (index % 3 !== 2 || !/^@[a-z0-9_]+(?:\.[a-z0-9_]+)*$/i.test(part) || part.length > 21)
          return part;
        const username = part.slice(1).toLowerCase();
        if (!linkMentions) {
          return (
            <span key={`${index}-${part}`} className="font-medium text-primary">
              {part}
            </span>
          );
        }
        return (
          <Link
            to="/u/$username"
            params={{ username }}
            key={`${index}-${part}`}
            className="font-medium text-primary hover:underline"
          >
            {part}
          </Link>
        );
      })}
    </>
  );
}
