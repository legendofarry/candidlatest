import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Archive,
  Check,
  CircleCheck,
  Clock3,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  MoreHorizontal,
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
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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

  if (loading) return <main className="min-h-dvh bg-background" />;
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

  const selectedCounts =
    category === "stories"
      ? counts?.stories
      : category === "comments"
        ? counts?.comments
        : (counts?.stories ?? 0) + (counts?.comments ?? 0);

  return (
    <main className="min-h-dvh bg-[#f5f6f1] pb-28 md:bg-background md:pb-12">
      <FloatingBackButton
        onClick={() => void navigate({ to: "/profile" })}
        className="hidden md:inline-flex"
      />
      <div className="w-full px-2 pt-2 md:px-0 md:pt-10">
        <header className="relative mb-5 overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-[#0a1a0e] via-[#0b190f] to-[#324b15] p-5 text-white md:hidden">
          <div className="relative z-10">
            <Link to="/profile" className="inline-flex items-center gap-2 text-xs text-white/70">
              <ProfileAvatar initials="Y" className="size-6 bg-lime-400 text-slate-950" />
              Your activity
            </Link>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
              My contributions
            </h1>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["Total", (counts?.stories ?? 0) + (counts?.comments ?? 0)],
                ["Stories", counts?.stories ?? 0],
                ["Comments", counts?.comments ?? 0],
              ].map(([label, count]) => (
                <div key={label} className="rounded-[1.35rem] bg-white/10 px-3 py-2.5">
                  <p className="text-2xl font-semibold leading-none">
                    {formatCount(Number(count))}
                  </p>
                  <p className="mt-1 text-xs text-white/65">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <PenLine
            aria-hidden="true"
            className="absolute -right-4 -top-5 size-28 rotate-12 text-white/[0.07]"
          />
        </header>

        <header className="mb-6 hidden flex-col gap-4 px-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:px-6 md:flex md:px-8">
          <div className="min-w-0">
            <Link
              to="/profile"
              className="mb-3 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <ProfileAvatar initials="Y" className="size-6" /> Your profile
            </Link>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Your activity
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              My contributions
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Find and manage every story and comment you’ve shared.
            </p>
          </div>
          <div className="flex items-center gap-3 sm:min-w-56">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <PenLine className="size-5" />
            </span>
            <div className="flex items-baseline gap-1.5">
              <p className="text-lg font-semibold leading-tight">
                {formatCount(selectedCounts ?? 0)}
              </p>
              <p className="text-sm text-muted-foreground">
                {category === "all" ? "contributions" : category}
              </p>
            </div>
          </div>
        </header>

        {category !== "comments" ? (
          <>
            <div className="mb-4 flex w-full items-center gap-3 rounded-[1.5rem] bg-card p-4 shadow-[0_6px_18px_rgba(0,0,0,.045)] md:hidden">
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
              <Button
                asChild
                size="sm"
                className="rounded-full bg-[#09170e] px-4 text-white hover:bg-[#14251a]"
              >
                <Link to="/billing">{maxPinnedStories === 0 ? "Manage" : "Manage"}</Link>
              </Button>
            </div>
            <div className="mb-4 hidden w-full flex-wrap items-center gap-3 border-y border-border px-4 py-3 sm:px-6 md:flex md:px-8">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Pin className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Profile pins</p>
                <p className="text-xs text-muted-foreground">
                  {maxPinnedStories === 0
                    ? "Premium members can pin up to 3 published stories."
                    : `${pinnedStoryIds.size} of ${maxPinnedStories} pins used`}
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link to="/billing">
                  {maxPinnedStories === 0 ? "See packages" : "Manage package"}
                </Link>
              </Button>
            </div>
          </>
        ) : null}

        <section className="w-full min-w-0">
          <div className="sticky top-16 z-30 space-y-3 bg-[#f5f6f1]/95 px-0 py-2 backdrop-blur-md sm:top-16 sm:px-6 sm:py-4 md:border-y md:border-border md:bg-background/95 md:px-8">
            <div className="flex flex-col gap-3">
              <div className="grid w-full grid-cols-3 rounded-full bg-[#eceee7] p-1 md:hidden">
                {(["all", "stories", "comments"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    aria-pressed={category === item}
                    className={cn(
                      "min-h-9 rounded-full px-2 text-sm font-medium capitalize transition-colors",
                      category === item
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    {item === "all" ? "All" : item}
                  </button>
                ))}
              </div>
              <div className="hidden w-full gap-5 overflow-x-auto border-b border-border md:flex">
                {(["all", "stories", "comments"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    aria-pressed={category === item}
                    className={`min-h-10 shrink-0 border-b-2 px-1 text-sm font-medium capitalize transition-colors ${category === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  >
                    {item === "all" ? "Everything" : item}
                  </button>
                ))}
              </div>
              <div className="flex w-full gap-3">
                <label className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search your posts"
                    className="h-11 rounded-full border-0 bg-card pl-10 shadow-sm md:rounded-lg md:border md:bg-background md:shadow-none"
                  />
                </label>
              </div>
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
                    "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors md:border",
                    status === value
                      ? "bg-[#09170e] text-white md:border-primary/35 md:bg-primary/10 md:text-foreground"
                      : "bg-card text-muted-foreground md:border-border md:bg-transparent hover:bg-secondary",
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
            <div className="mx-auto flex min-h-72 max-w-md flex-col items-center justify-center px-6 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageSquareText className="size-7" />
              </span>
              <h2 className="mt-4 text-lg font-semibold">
                {search
                  ? "No matches in loaded contributions"
                  : category === "all"
                    ? "Your contributions will appear here"
                    : `No ${category} yet`}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Stories and comments you share on Candid will be easy to find here.
              </p>
              {!search ? (
                <Button asChild className="mt-5">
                  <Link to="/post">Share a story</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 px-0 md:space-y-0 md:divide-y md:divide-border">
              {items.map((item) => (
                <ContributionRow
                  key={`${item.type}-${item.id}`}
                  item={item}
                  isPinned={pinnedStoryIds.has(item.id)}
                  pinnedCount={pinnedStoryIds.size}
                  maxPinnedStories={maxPinnedStories}
                  membershipTier={membershipTier}
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
            <div className="flex justify-center border-t border-border p-4 sm:p-5">
              <Button
                variant="outline"
                className="min-w-48 rounded-xl"
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
  membershipTier,
  pinning,
  onTogglePin,
  onEdit,
  onDelete,
}: {
  item: Contribution;
  isPinned: boolean;
  pinnedCount: number;
  maxPinnedStories: number;
  membershipTier: MembershipTier;
  pinning: boolean;
  onTogglePin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
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
  const statusTone =
    item.isDeleted || item.status === "hidden"
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
    <>
      <article className="group hidden w-full flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-6 md:flex md:px-8">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${isStory ? "bg-primary/10 text-primary" : "bg-sky-500/10 text-sky-600 dark:text-sky-300"}`}
          >
            {isStory ? <PenLine className="size-5" /> : <MessageSquareText className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {isStory ? item.companyName || "Workplace story" : `Comment · ${item.storyTitle}`}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusTone}`}>
                {statusLabel}
              </span>
            </div>
            <h2 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
              {item.isDeleted ? "Comment removed" : item.title}
            </h2>
            {!isStory && !item.isDeleted ? (
              <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            ) : null}
            {isStory ? (
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
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
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-[3.25rem] sm:pl-0">
          {canView ? (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="min-h-9 flex-1 rounded-xl sm:flex-none"
            >
              <Link
                to={href}
                params={{ id: item.storyId }}
                {...(isStory ? {} : { search: { comment: item.id } })}
              >
                View
              </Link>
            </Button>
          ) : (
            <span className="flex min-h-9 flex-1 items-center justify-center rounded-xl bg-secondary/60 px-3 text-center text-xs text-muted-foreground sm:flex-none">
              {item.authorDeleted ? "Removed" : "Not public"}
            </span>
          )}
          {isStory && canEdit ? (
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="min-h-9 flex-1 rounded-xl sm:flex-none"
            >
              <Link to="/post" search={{ edit: item.id }}>
                {item.status === "published" ? "Edit story" : "Edit / resubmit"}
              </Link>
            </Button>
          ) : null}
          {!isStory && canEdit ? (
            <Button
              size="sm"
              variant="secondary"
              className="min-h-9 flex-1 rounded-xl sm:flex-none"
              onClick={onEdit}
            >
              Edit
            </Button>
          ) : null}
          {isStory && canView ? (
            isPinned ? (
              <Button
                size="sm"
                variant="outline"
                className="min-h-9 rounded-xl"
                disabled={pinning}
                onClick={onTogglePin}
              >
                {pinning ? <LoaderCircle className="size-4" /> : <PinOff className="size-4" />}
                Unpin
              </Button>
            ) : maxPinnedStories === 0 ? (
              <Button asChild size="sm" variant="outline" className="min-h-9 rounded-xl">
                <Link to="/billing" title="Upgrade to Premium to pin a story">
                  <LockKeyhole className="size-4" /> Pin
                </Link>
              </Button>
            ) : pinLimitReached ? (
              <Button
                size="sm"
                variant="outline"
                className="min-h-9 rounded-xl"
                disabled
                title="Premium includes up to 3 pinned stories"
              >
                <LockKeyhole className="size-4" /> Pin limit
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="min-h-9 rounded-xl"
                disabled={pinning}
                onClick={onTogglePin}
              >
                {pinning ? <LoaderCircle className="size-4" /> : <Pin className="size-4" />}
                Pin
              </Button>
            )
          ) : null}
          {!isRemoved ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${isStory ? "story" : "comment"}`}
              className="size-9 shrink-0 rounded-xl text-muted-foreground hover:text-danger"
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </article>
      <article className="rounded-[1.5rem] bg-card p-4 shadow-[0_6px_18px_rgba(0,0,0,.045)] md:hidden">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              isStory ? "bg-lime-100 text-[#263716]" : "bg-[#d0f3f2] text-[#122d2d]",
            )}
          >
            {isStory ? <PenLine className="size-5" /> : <MessageSquareText className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs">
              <span className="font-semibold">{isStory ? "Story" : "Comment"}</span>
              <span className="text-muted-foreground">
                {" · "}
                {isStory ? item.companyName || "Workplace story" : item.storyTitle}
              </span>
            </p>
            <h2 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">
              {item.isDeleted ? "Comment removed" : item.title}
            </h2>
            {isStory && item.body ? (
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                {item.body}
              </p>
            ) : null}
          </div>
          {isPinned ? (
            <span
              className="flex size-7 shrink-0 items-center justify-center text-lime-700"
              aria-label="Pinned on profile"
            >
              <Pin className="size-3.5 fill-current" />
            </span>
          ) : null}
          <button
            type="button"
            aria-label={`More actions for ${isStory ? "story" : "comment"}`}
            onClick={() => setMenuOpen(true)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2 pl-[3.25rem]">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium",
              statusTone,
            )}
          >
            {item.status === "published" ? (
              <CircleCheck className="size-3" />
            ) : item.status === "pending" ? (
              <Clock3 className="size-3" />
            ) : (
              <EyeOff className="size-3" />
            )}
            {item.status === "hidden" ? "Not public" : statusLabel}
          </span>
          <span className="text-[10px] text-muted-foreground">{dateLabel}</span>
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            {canView ? (
              <Button
                asChild
                size="sm"
                variant="secondary"
                className="min-h-10 flex-1 rounded-full bg-[#eceee7] text-foreground hover:bg-[#e2e5dc]"
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
              <span className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-secondary/60 px-3 text-xs text-muted-foreground">
                <EyeOff className="size-4" /> Not public
              </span>
            )}
            {isStory && canEdit ? (
              <Button
                asChild
                size="sm"
                className="min-h-10 flex-1 rounded-full bg-[#09170e] text-white hover:bg-[#14251a]"
              >
                <Link to="/post" search={{ edit: item.id }}>
                  <PenLine className="size-4" /> Edit
                </Link>
              </Button>
            ) : null}
            {!isStory && canEdit ? (
              <Button
                size="sm"
                className="min-h-10 flex-1 rounded-full bg-[#09170e] text-white hover:bg-[#14251a]"
                onClick={onEdit}
              >
                <PenLine className="size-4" /> Edit
              </Button>
            ) : null}
            {isStory && canView ? (
              maxPinnedStories === 0 ? (
                <Button
                  asChild
                  size="icon"
                  variant="secondary"
                  className="size-10 shrink-0 rounded-full bg-secondary"
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
                    "size-10 shrink-0 rounded-full",
                    isPinned ? "bg-lime-100 text-[#263716]" : "bg-secondary",
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
                className="size-10 shrink-0 rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200 hover:text-rose-700"
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
          {isStory && item.status === "published" ? (
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              Edits go through review again
            </p>
          ) : null}
        </div>
      </article>

      <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
        <DrawerContent className="max-h-[80dvh] rounded-t-3xl px-0 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
          <DrawerHeader className="text-left">
            <DrawerTitle>{isStory ? "Story actions" : "Comment actions"}</DrawerTitle>
            <DrawerDescription>Manage this contribution.</DrawerDescription>
          </DrawerHeader>
          <div className="grid gap-1 px-4">
            {canView ? (
              <DrawerClose asChild>
                <Link
                  to={href}
                  params={{ id: item.storyId }}
                  {...(isStory ? {} : { search: { comment: item.id } })}
                  className="flex min-h-12 items-center gap-3 border-b border-border px-2 text-sm font-medium"
                >
                  <Eye className="size-4" /> View
                </Link>
              </DrawerClose>
            ) : null}
            {canEdit ? (
              isStory ? (
                <DrawerClose asChild>
                  <Link
                    to="/post"
                    search={{ edit: item.id }}
                    className="flex min-h-12 items-center gap-3 border-b border-border px-2 text-sm font-medium"
                  >
                    <PenLine className="size-4" /> Edit story
                  </Link>
                </DrawerClose>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="flex min-h-12 items-center gap-3 border-b border-border px-2 text-left text-sm font-medium"
                >
                  <PenLine className="size-4" /> Edit comment
                </button>
              )
            ) : null}
            {isStory && canView && maxPinnedStories > 0 ? (
              <button
                type="button"
                disabled={pinning || pinLimitReached}
                onClick={() => {
                  setMenuOpen(false);
                  onTogglePin();
                }}
                className="flex min-h-12 items-center gap-3 border-b border-border px-2 text-left text-sm font-medium disabled:opacity-50"
              >
                {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                {isPinned ? "Remove profile pin" : "Pin to profile"}
              </button>
            ) : null}
            {!isRemoved ? (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="flex min-h-12 items-center gap-3 px-2 text-left text-sm font-medium text-danger"
              >
                <Trash2 className="size-4" /> Delete
              </button>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
