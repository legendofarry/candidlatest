import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Check,
  Clock3,
  Grid2X2,
  LayoutGrid,
  LayoutList,
  LoaderCircle,
  MessageSquareText,
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
import { getMyContributions } from "@/lib/social.functions";
import { notify as toast } from "@/lib/notifications-store";
import { formatCount } from "@/lib/utils";
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
type ViewMode = "list" | "grid" | "tiles";
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
  const removeStory = useServerFn(deleteStory);
  const removeComment = useServerFn(deleteComment);
  const updateComment = useServerFn(editComment);
  const [category, setCategory] = useState<Category>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Contribution | null>(null);
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState<Contribution | null>(null);
  const [savingDelete, setSavingDelete] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("candid:contribution-view");
      if (saved === "list" || saved === "grid" || saved === "tiles") setView(saved);
    } catch {
      /* Keep the default view if local storage is unavailable. */
    }
  }, []);

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

  function setViewMode(next: ViewMode) {
    setView(next);
    try {
      window.localStorage.setItem("candid:contribution-view", next);
    } catch {
      /* View still updates for this session. */
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setSavingDelete(true);
    try {
      if (deleting.type === "story") await removeStory({ data: { story_id: deleting.id } });
      else await removeComment({ data: { comment_id: deleting.id } });
      toast.success(deleting.type === "story" ? "Story removed from Candid" : "Comment removed");
      setDeleting(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-contributions", user?.uid] }),
        deleting.type === "story"
          ? Promise.all([
              queryClient.invalidateQueries({ queryKey: ["stories"] }),
              queryClient.invalidateQueries({ queryKey: ["story-pages"] }),
              queryClient.invalidateQueries({ queryKey: ["story", deleting.id] }),
              queryClient.invalidateQueries({ queryKey: ["company-scores"] }),
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
      toast.success("Comment updated");
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
    <main className="min-h-dvh bg-background pb-28 md:pb-12">
      <FloatingBackButton
        onClick={() => void navigate({ to: "/profile" })}
        className="hidden md:inline-flex"
      />
      <div className="w-full pt-5 md:pt-10">
        <header className="mb-6 flex flex-col gap-4 px-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:px-6 md:px-8">
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

        <section className="w-full min-w-0">
          <div className="space-y-4 border-y border-border bg-background/70 px-4 py-3 sm:px-6 sm:py-5 md:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-secondary/70 p-1 lg:w-auto">
                {(["all", "stories", "comments"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-4 text-sm font-medium capitalize transition-colors lg:flex-none ${category === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {item === "all" ? "Everything" : item}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <label className="relative min-w-0 flex-1 lg:w-72 lg:flex-none">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search loaded items"
                    className="h-10 rounded-xl pl-9"
                  />
                </label>
                <div
                  className="flex shrink-0 rounded-xl border border-border p-1"
                  aria-label="View options"
                >
                  <ViewButton value="list" current={view} onClick={setViewMode} label="List view">
                    <LayoutList className="size-4" />
                  </ViewButton>
                  <ViewButton value="grid" current={view} onClick={setViewMode} label="Grid view">
                    <Grid2X2 className="size-4" />
                  </ViewButton>
                  <ViewButton value="tiles" current={view} onClick={setViewMode} label="Tile view">
                    <LayoutGrid className="size-4" />
                  </ViewButton>
                </div>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {(
                [
                  ["all", "All statuses", Archive],
                  ["published", "Published", Check],
                  ["pending", "In review", Clock3],
                  ["hidden", "Hidden", Archive],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${status === value ? "border-primary/35 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-secondary"}`}
                >
                  <Icon
                    className={`size-3.5 ${value === "pending" ? "text-amber-500" : value === "published" ? "text-primary" : ""}`}
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
            <div
              className={
                view === "list"
                  ? "divide-y divide-border"
                  : view === "grid"
                    ? "grid gap-3 p-3 sm:grid-cols-2 sm:p-5 xl:grid-cols-3"
                    : "columns-1 gap-3 p-3 sm:columns-2 sm:p-5 xl:columns-3"
              }
            >
              {items.map((item) => (
                <ContributionCard
                  key={`${item.type}-${item.id}`}
                  item={item}
                  view={view}
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

function ViewButton({
  value,
  current,
  onClick,
  label,
  children,
}: {
  value: ViewMode;
  current: ViewMode;
  onClick: (view: ViewMode) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={current === value}
      onClick={() => onClick(value)}
      className={`flex size-8 items-center justify-center rounded-lg transition-colors ${current === value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function ContributionCard({
  item,
  view,
  onEdit,
  onDelete,
}: {
  item: Contribution;
  view: ViewMode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isList = view === "list";
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
  return (
    <article
      className={`${isList ? "group flex flex-col gap-3 px-3 py-4 sm:flex-row sm:items-center sm:px-5" : `mb-3 break-inside-avoid rounded-2xl border border-border bg-background p-4 transition-shadow hover:shadow-md ${view === "tiles" ? "border-l-2 border-l-primary/50" : ""}`}`}
    >
      <div className={`flex min-w-0 items-start gap-3 ${isList ? "flex-1" : ""}`}>
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
            <p
              className={`mt-1 text-sm leading-relaxed text-muted-foreground ${view === "tiles" ? "line-clamp-2" : "line-clamp-3"}`}
            >
              {item.body}
            </p>
          ) : null}
          {isStory && view !== "tiles" ? (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {item.createdAt
              ? new Date(item.createdAt).toLocaleDateString("en-KE", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "Date unavailable"}
            {isStory && item.status === "pending"
              ? " · Only you can see this while it is reviewed"
              : isStory && item.status === "published"
                ? " · Edits go through review again"
                : ""}
          </p>
        </div>
      </div>
      <div
        className={`flex items-center gap-2 ${isList ? "pl-[3.25rem] sm:pl-0" : "mt-4 border-t border-border pt-3"}`}
      >
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
  );
}
