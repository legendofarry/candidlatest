import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  Check,
  CircleCheck,
  Clock3,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Pin,
  PinOff,
  PenLine,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FloatingBackButton } from "@/components/site/floating-back-button";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { useAuth } from "@/hooks/useAuth";
import { deleteStory, editComment, deleteComment } from "@/lib/actions.functions";
import { getMyContributions, toggleMyProfileStoryPin } from "@/lib/social.functions";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { getMembershipEntitlements, type MembershipTier } from "@/lib/membership";
import { notify as toast } from "@/lib/notifications-store";
import { cn, formatCount } from "@/lib/utils";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/my-contributions")({
  head: () => ({
    meta: [
      { title: "My contributions | Candid" },
      {
        name: "description",
        content: "Manage the stories and comments you have shared on Candid.",
      },
    ],
  }),
  component: MyContributionsPage,
});

type Category = "all" | "stories" | "comments";
type StatusFilter = "all" | "published" | "pending" | "hidden";
type Contribution = {
  id: string;
  type: "story" | "comment";
  title: string;
  body: string;
  createdAt: string;
  status: string;
  storyId: string;
  storyTitle: string;
  storyStatus: string;
  companyName: string | null;
  isDeleted: boolean;
  authorDeleted: boolean;
  isPinned: boolean;
};
type ContributionCursor = {
  stories: { createdAt: string; id: string } | null;
  comments: { createdAt: string; id: string } | null;
} | null;

function MyContributionsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchContributions = useServerFn(getMyContributions);
  const fetchAccount = useServerFn(getOnboardingState);
  const toggleStoryPin = useServerFn(toggleMyProfileStoryPin);
  const removeStory = useServerFn(deleteStory);
  const removeComment = useServerFn(deleteComment);
  const updateComment = useServerFn(editComment);
  const [category, setCategory] = useState<Category>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Contribution | null>(null);
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState<Contribution | null>(null);
  const [savingDelete, setSavingDelete] = useState(false);
  const [pinningStoryId, setPinningStoryId] = useState<string | null>(null);

  const account = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? null],
    queryFn: () => fetchAccount(),
    enabled: Boolean(user),
  });
  const pinnedStoryIds = useMemo(
    () => new Set(account.data?.pinnedStoryIds ?? []),
    [account.data?.pinnedStoryIds],
  );
  const membershipTier = (account.data?.membership.tier ?? "basic") as MembershipTier;
  const maxPinnedStories = getMembershipEntitlements(membershipTier).maxPinnedStories;

  async function togglePinnedStory(storyId: string) {
    if (!user || pinningStoryId) return;
    setPinningStoryId(storyId);
    try {
      await toggleStoryPin({ data: { story_id: storyId } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["onboarding-state", user.uid] }),
        queryClient.invalidateQueries({ queryKey: ["my-contributions", user.uid] }),
        queryClient.invalidateQueries({ queryKey: ["public-profile"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your profile pins.");
    } finally {
      setPinningStoryId(null);
    }
  }

  const contributions = useInfiniteQuery({
    queryKey: ["my-contributions", user?.uid ?? null, category, status],
    queryFn: ({ pageParam }) =>
      fetchContributions({ data: { limit: 20, category, status, cursor: pageParam } }),
    initialPageParam: null as ContributionCursor,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(user),
    staleTime: 30_000,
  });
  const items = useMemo(
    () =>
      (contributions.data?.pages.flatMap((page) => page.items as Contribution[]) ?? []).filter(
        (item) =>
          !search.trim() ||
          `${item.title} ${item.body} ${item.storyTitle} ${item.companyName ?? ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [contributions.data, search],
  );
  const counts = contributions.data?.pages[0]?.counts;

  async function confirmDelete() {
    if (!deleting) return;
    setSavingDelete(true);
    try {
      if (deleting.type === "story") await removeStory({ data: { story_id: deleting.id } });
      else await removeComment({ data: { comment_id: deleting.id } });
      setDeleting(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-contributions", user?.uid] }),
        deleting.type === "story"
          ? Promise.all([
            queryClient.invalidateQueries({ queryKey: ["stories"] }),
            queryClient.invalidateQueries({ queryKey: ["story-pages"] }),
            queryClient.invalidateQueries({ queryKey: ["story", deleting.id] }),
            queryClient.invalidateQueries({ queryKey: ["company-scores"] }),
            queryClient.invalidateQueries({ queryKey: ["onboarding-state", user?.uid] }),
            queryClient.invalidateQueries({ queryKey: ["public-profile"] }),
          ])
          : queryClient.invalidateQueries({ queryKey: ["story", deleting.storyId] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove this contribution");
    } finally {
      setSavingDelete(false);
    }
  }

  async function saveCommentEdit() {
    if (!editing || editBody.trim().length < 2) return;
    setSavingEdit(true);
    try {
      await updateComment({ data: { comment_id: editing.id, body: editBody.trim() } });
      setEditing(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-contributions", user?.uid] }),
        queryClient.invalidateQueries({ queryKey: ["story", editing.storyId] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update comment");
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-[50dvh] items-center justify-center bg-background">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (!user) {
    return (
      <main className="mx-auto min-h-dvh max-w-3xl px-4 py-14 text-center">
        <h1 className="font-display text-2xl font-bold">Sign in to manage your contributions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your stories and comments are saved to your account.
        </p>
        <Button asChild className="mt-5">
          <Link to="/auth">Sign in</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-background pb-28 md:pb-12">
      <FloatingBackButton
        onClick={() => void navigate({ to: "/profile" })}
        className="hidden md:inline-flex"
      />
      <div className="w-full px-0 pt-0 md:pt-8">
        <header className="flex flex-col gap-5 px-4 pb-5 pt-4 sm:px-6 md:flex-row md:items-end md:justify-between md:px-8 md:pt-0">
          <div className="min-w-0">
            <Link
              to="/profile"
              className="mb-3 inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ProfileAvatar
                photoUrl={user.photoURL}
                initials={(user.displayName || user.email || "U").slice(0, 1).toUpperCase()}
                className="size-6"
              />
              Your profile
              <ArrowUpRight className="size-3.5" />
            </Link>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Your activity
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              My contributions
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your stories and comments, all in one place.
            </p>
          </div>
          <div className="flex items-center gap-7 sm:gap-9">
            {[
              ["Total", (counts?.stories ?? 0) + (counts?.comments ?? 0)],
              ["Stories", counts?.stories ?? 0],
              ["Comments", counts?.comments ?? 0],
            ].map(([label, count]) => (
              <div key={label}>
                <p className="text-xl font-semibold leading-none tabular-nums">
                  {formatCount(Number(count))}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </header>

        {category !== "comments" ? (
          <>
            <div className="mb-4 flex w-full items-center gap-3 px-4 py-3 sm:px-6 md:px-8">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime-100 text-[#182515]">
                <Pin className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Profile pins</p>
                <p className="text-xs text-muted-foreground">
                  {maxPinnedStories === 0
                    ? "Premium members can pin up to 3 published stories."
                    : `${pinnedStoryIds.size} of ${maxPinnedStories} used`}
                </p>
                <div className="mt-1.5 flex max-w-48 gap-1">
                  {Array.from({ length: Math.min(3, maxPinnedStories || 3) }).map((_, index) => (
                    <span
                      key={index}
                      className={cn(
                        "h-1.5 flex-1 rounded-full",
                        index < pinnedStoryIds.size ? "bg-lime-500" : "bg-secondary",
                      )}
                    />
                  ))}
                </div>
              </div>
              <Button asChild variant="ghost" size="sm" className="shrink-0 rounded-full">
                <Link to="/billing">{maxPinnedStories === 0 ? "View plans" : "Manage"}</Link>
              </Button>
            </div>
          </>
        ) : null}

        <section className="w-full min-w-0">
          <div className="sticky top-16 z-30 space-y-3 bg-background/95 px-4 py-3 backdrop-blur-md sm:px-6 md:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="grid w-full grid-cols-3 rounded-full bg-secondary/70 p-1 sm:w-auto sm:shrink-0">
                {(["all", "stories", "comments"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    aria-pressed={category === item}
                    className={cn(
                      "min-h-9 rounded-full px-4 text-sm font-medium capitalize transition-colors",
                      category === item
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item === "all" ? "All" : item}
                  </button>
                ))}
              </div>
              <label className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search stories and comments"
                  className="h-11 rounded-full border-0 bg-secondary/50 pl-10 shadow-none focus-visible:ring-1"
                />
              </label>
            </div>
            <div className="flex w-full gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(
                [
                  ["all", "All statuses", Archive],
                  ["published", "Published", Check],
                  ["pending", "In review", Clock3],
                  ["hidden", "Not public", EyeOff],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  aria-pressed={status === value}
                  className={cn(
                    "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                    status === value
                      ? "bg-primary text-primary-foreground md:bg-primary/10 md:text-foreground"
                      : "bg-card text-muted-foreground md:bg-transparent hover:bg-secondary",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-3.5",
                      value === "pending"
                        ? "text-amber-500"
                        : value === "published"
                          ? status === value
                            ? "text-lime-300 md:text-primary"
                            : "text-primary"
                          : "",
                    )}
                  />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {contributions.isPending ? (
            <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" /> Loading your contributions…
            </div>
          ) : contributions.isError ? (
            <div className="p-10 text-center">
              <p className="font-medium">Couldn’t load your contributions</p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => void contributions.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-[45dvh] w-full flex-col items-center justify-center px-6 py-12 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageSquareText className="size-7" />
              </span>
              <h2 className="mt-5 text-xl font-semibold">
                {search
                  ? "No matches in loaded contributions"
                  : category === "all"
                    ? "Your contributions start here"
                    : `No ${category} yet`}
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {search
                  ? "Try another search to find a story or comment."
                  : "Share a workplace story to help others understand what it’s like to work there."}
              </p>
              {!search ? (
                <Button asChild className="mt-6 rounded-full px-5">
                  <Link to="/post">Share a story</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1 px-0">
              {items.map((item) => (
                <ContributionRow
                  key={`${item.type}-${item.id}`}
                  item={item}
                  isPinned={pinnedStoryIds.has(item.id)}
                  pinnedCount={pinnedStoryIds.size}
                  maxPinnedStories={maxPinnedStories}
                  pinning={pinningStoryId === item.id}
                  onTogglePin={() => void togglePinnedStory(item.id)}
                  onEdit={() => {
                    setEditing(item);
                    setEditBody(item.body);
                  }}
                  onDelete={() => setDeleting(item)}
                />
              ))}
            </div>
          )}

          {contributions.hasNextPage ? (
            <div className="flex justify-center px-4 py-6 sm:px-6">
              <Button
                variant="outline"
                className="min-w-48 rounded-full"
                disabled={contributions.isFetchingNextPage}
                onClick={() => void contributions.fetchNextPage()}
              >
                {contributions.isFetchingNextPage ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : null}
                {contributions.isFetchingNextPage ? "Loading…" : "Load more contributions"}
              </Button>
            </div>
          ) : null}
        </section>
      </div>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !savingEdit) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit your comment</DialogTitle>
            <DialogDescription>
              Keep it clear and respectful. Your update will appear on the original story.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={editBody}
            onChange={(event) => setEditBody(event.target.value)}
            maxLength={2000}
            rows={6}
            className="resize-y rounded-2xl"
          />
          <p className="text-right text-xs text-muted-foreground">{editBody.length}/2000</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button
              onClick={() => void saveCommentEdit()}
              disabled={savingEdit || editBody.trim().length < 2}
            >
              {savingEdit ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}Save
              changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !savingDelete) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting?.type === "story" ? "Remove this story?" : "Remove this comment?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.type === "story"
                ? "It will no longer appear in public Candid feeds. The story record is retained for moderation and reporting."
                : "The comment text will be removed from the discussion."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingDelete}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              disabled={savingDelete}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              {savingDelete ? (
                <LoaderCircle className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function ContributionRow({
  item,
  isPinned,
  pinnedCount,
  maxPinnedStories,
  pinning,
  onTogglePin,
  onEdit,
  onDelete,
}: {
  item: Contribution;
  isPinned: boolean;
  pinnedCount: number;
  maxPinnedStories: number;
  pinning: boolean;
  onTogglePin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isStory = item.type === "story";
  const isRemoved = item.isDeleted || item.authorDeleted || item.status === "hidden";
  const statusLabel =
    item.isDeleted || item.authorDeleted
      ? "Removed by you"
      : item.status === "pending"
        ? "In review"
        : item.status === "published"
          ? "Published"
          : "Hidden";
  const statusTone = isRemoved
    ? "bg-muted text-muted-foreground"
    : item.status === "pending"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "bg-primary/10 text-primary";
  const href = isStory ? ("/stories/$id" as const) : ("/stories/$id" as const);
  const canView = isStory ? item.status === "published" : item.storyStatus === "published";
  const canEdit = isStory ? !item.authorDeleted : !item.isDeleted && item.status === "published";
  const pinLimitReached = !isPinned && pinnedCount >= maxPinnedStories;
  const dateLabel = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString("en-KE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    : "Date unavailable";
  return (
    <article className="group flex w-full flex-col px-4 py-5 transition-colors hover:bg-secondary/20 sm:px-6 md:flex-row md:items-start md:gap-6 md:px-8">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            isStory ? "bg-primary/15 text-primary" : "bg-sky-500/15 text-sky-700 dark:text-sky-300",
          )}
        >
          {isStory ? <PenLine className="size-5" /> : <MessageSquareText className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            <span className="font-semibold">{isStory ? "Story" : "Comment"}</span>
            <span className="text-muted-foreground">·</span>
            <span className="min-w-0 truncate text-muted-foreground">
              {isStory ? item.companyName || "Workplace story" : item.storyTitle}
            </span>
            <span
              className={cn(
                "ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                statusTone,
              )}
            >
              {statusLabel === "Published" ? <CircleCheck className="size-3" /> : null}
              {item.status === "pending" ? <Clock3 className="size-3" /> : null}
              {item.status === "hidden" ? <EyeOff className="size-3" /> : null}
              {statusLabel}
            </span>
          </p>
          {item.body && !(item.type === "comment" && item.isDeleted) ? (
            <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {dateLabel}
            {isStory && item.status === "pending"
              ? " · Only you can see this while it is reviewed"
              : isStory && item.status === "published"
                ? " · Edits go through review again"
                : ""}
          </p>
        </div>
        {isPinned ? (
          <span
            className="flex size-7 shrink-0 items-center justify-center text-lime-700"
            aria-label="Pinned on profile"
          >
            <Pin className="size-3.5 fill-current" />
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 pl-[3.25rem] md:mt-1 md:max-w-[45%] md:justify-end md:pl-0">
        {canView ? (
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="min-h-9 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
          >
            <Link
              to={href}
              params={{ id: item.storyId }}
              {...(isStory ? {} : { search: { comment: item.id } })}
            >
              <Eye className="size-4" /> View
            </Link>
          </Button>
        ) : (
          <span className="flex min-h-9 items-center gap-1.5 rounded-full bg-secondary/50 px-3 text-xs text-muted-foreground">
            <EyeOff className="size-4" /> {item.authorDeleted ? "Removed" : "Not public"}
          </span>
        )}
        {isStory && canEdit ? (
          <Button asChild size="sm" className="min-h-9 rounded-full">
            <Link to="/post" search={{ edit: item.id }}>
              <PenLine className="size-4" /> Edit
            </Link>
          </Button>
        ) : null}
        {!isStory && canEdit ? (
          <Button size="sm" className="min-h-9 rounded-full" onClick={onEdit}>
            <PenLine className="size-4" /> Edit
          </Button>
        ) : null}
        {isStory && canView ? (
          maxPinnedStories === 0 ? (
            <Button
              asChild
              size="icon"
              variant="secondary"
              className="size-9 shrink-0 rounded-full bg-secondary"
            >
              <Link to="/billing" aria-label="Upgrade to pin a story">
                <LockKeyhole className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button
              size="icon"
              variant="secondary"
              className={cn(
                "size-9 shrink-0 rounded-full",
                isPinned ? "bg-primary/15 text-primary" : "bg-secondary",
              )}
              disabled={pinning || pinLimitReached}
              onClick={onTogglePin}
              aria-label={isPinned ? "Unpin story" : "Pin story"}
              title={pinLimitReached ? "Premium includes up to 3 pinned stories" : undefined}
            >
              {pinning ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : isPinned ? (
                <PinOff className="size-4" />
              ) : (
                <Pin className="size-4" />
              )}
            </Button>
          )
        ) : null}
        {!isRemoved ? (
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Remove ${isStory ? "story" : "comment"}`}
            className="size-9 shrink-0 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>
    </article>
  );
}
