import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Eye,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { deleteStory, editComment, deleteComment } from "@/lib/actions.functions";
import { getMyContributions } from "@/lib/social.functions";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
};
type ContributionCursor = {
  stories: { createdAt: string; id: string } | null;
  comments: { createdAt: string; id: string } | null;
} | null;

function MyContributionsPage() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const fetchContributions = useServerFn(getMyContributions);
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

  const total = (counts?.stories ?? 0) + (counts?.comments ?? 0);
  const tabs = [
    ["all", "All", total],
    ["stories", "Stories", counts?.stories ?? 0],
    ["comments", "Comments", counts?.comments ?? 0],
  ] as const;
  const statuses = [
    ["all", "Everything"],
    ["published", "Published"],
    ["pending", "In review"],
    ["hidden", "Not public"],
  ] as const;

  return (
    <main className="min-h-dvh bg-background pb-32 md:pb-16">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 md:pt-10">
        <header className="flex flex-col gap-5">
          <Link
            to="/profile"
            className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Profile
          </Link>
          <div className="flex items-end justify-between gap-4">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              My contributions
            </h1>
            <Button asChild className="hidden h-11 rounded-full px-5 md:inline-flex">
              <Link to="/post">
                <Plus className="mr-1.5 size-4" /> Share a story
              </Link>
            </Button>
          </div>
        </header>

        <div className="sticky top-16 z-30 -mx-4 mt-6 space-y-3 bg-background/95 px-4 pb-3 pt-1 backdrop-blur-md sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              role="tablist"
              className="grid flex-1 grid-cols-3 rounded-full bg-secondary/70 p-1 md:flex md:flex-none md:gap-1"
            >
              {tabs.map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={category === value}
                  onClick={() => setCategory(value)}
                  className={cn(
                    "min-h-10 rounded-full px-4 text-sm transition-colors",
                    category === value
                      ? "bg-background font-semibold text-foreground shadow-sm"
                      : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                  <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                    {formatCount(count)}
                  </span>
                </button>
              ))}
            </div>
            <label className="relative hidden min-w-0 flex-1 md:block">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search"
                className="h-11 rounded-full border-0 bg-secondary/50 pl-10 shadow-none focus-visible:ring-1"
              />
            </label>
          </div>
          <label className="relative block md:hidden">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search your contributions"
              className="h-11 rounded-full border-0 bg-secondary/50 pl-10 shadow-none focus-visible:ring-1"
            />
          </label>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
            {statuses.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                aria-pressed={status === value}
                className={cn(
                  "min-h-9 shrink-0 rounded-full border px-4 text-sm transition-colors",
                  status === value
                    ? "border-foreground bg-foreground font-semibold text-background"
                    : "border-border bg-card font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <section className="mt-2">
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
            <div className="flex min-h-[50dvh] flex-col items-center justify-center px-6 py-12 text-center">
              <span className="flex size-20 items-center justify-center rounded-[28px] bg-primary/10 text-primary">
                <MessageSquareText className="size-9" />
              </span>
              <h2 className="mt-6 font-display text-2xl font-semibold">
                {search
                  ? "No matches"
                  : category === "all" && status === "all"
                    ? "Nothing shared yet"
                    : "Nothing here"}
              </h2>
              <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted-foreground">
                {search
                  ? "Try another search."
                  : status !== "all"
                    ? "No contributions with this status."
                    : "Your stories and comments will show up here."}
              </p>
              {!search && status === "all" ? (
                <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
                  <Button asChild className="h-12 rounded-full">
                    <Link to="/post">
                      <Plus className="mr-1.5 size-4" /> Share your first story
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="h-12 rounded-full">
                    <Link to="/">Read stories and comment</Link>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <ContributionCard
                  key={`${item.type}-${item.id}`}
                  item={item}
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
            <div className="flex justify-center py-8">
              <Button
                variant="outline"
                className="h-12 min-w-44 rounded-full"
                disabled={contributions.isFetchingNextPage}
                onClick={() => void contributions.fetchNextPage()}
              >
                {contributions.isFetchingNextPage ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : null}
                {contributions.isFetchingNextPage ? "Loading…" : "Show more"}
              </Button>
            </div>
          ) : null}
        </section>
      </div>

      <Link
        to="/post"
        className="fixed bottom-24 right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background shadow-xl md:hidden"
      >
        <Plus className="size-5" /> Share a story
      </Link>

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

function ContributionCard({
  item,
  onEdit,
  onDelete,
}: {
  item: Contribution;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isStory = item.type === "story";
  const removed = item.isDeleted || item.authorDeleted;
  const state: "published" | "review" | "hidden" | "removed" = removed
    ? "removed"
    : item.status === "pending"
      ? "review"
      : item.status === "published"
        ? "published"
        : "hidden";
  const label = {
    published: "Published",
    review: "In review",
    hidden: "Not public",
    removed: "Removed",
  }[state];
  const dot = {
    published: "bg-primary",
    review: "bg-amber-500",
    hidden: "bg-muted-foreground/60",
    removed: "bg-muted-foreground/40",
  }[state];
  const tone = {
    published: "text-primary",
    review: "text-amber-700 dark:text-amber-300",
    hidden: "text-foreground",
    removed: "text-muted-foreground",
  }[state];
  const canView = isStory ? item.status === "published" : item.storyStatus === "published";
  const canEdit = isStory ? !item.authorDeleted : !item.isDeleted && item.status === "published";
  const date = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
  const heading = isStory ? item.title || item.companyName || "Workplace story" : null;
  const note =
    state === "review"
      ? "We are checking this before it goes live. Only you can see it until then."
      : state === "hidden"
        ? "Not public right now. Edit it and send it for review again."
        : null;
  const viewLink = (children: ReactNode) => (
    <Link
      to="/stories/$id"
      params={{ id: item.storyId }}
      {...(isStory ? {} : { search: { comment: item.id } })}
    >
      {children}
    </Link>
  );

  return (
    <article
      className={cn(
        "overflow-hidden rounded-3xl border border-border bg-card",
        state === "removed" && "opacity-70",
      )}
    >
      <div className="px-5 pb-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
            <span className={cn("inline-flex items-center gap-1.5 font-semibold", tone)}>
              <span className={cn("size-1.5 rounded-full", dot)} />
              {label}
            </span>
            <span aria-hidden="true">·</span>
            <span>{isStory ? "Story" : "Comment"}</span>
            {date ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{date}</span>
              </>
            ) : null}
          </p>
          {!removed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="More actions"
                  className="-mr-2 size-11 shrink-0 rounded-full text-muted-foreground"
                >
                  <MoreHorizontal className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1.5">
                {canView ? (
                  <DropdownMenuItem asChild className="h-11 rounded-xl">
                    {viewLink(
                      <>
                        <Eye className="mr-2 size-4" /> View
                      </>,
                    )}
                  </DropdownMenuItem>
                ) : null}
                {canEdit ? (
                  isStory ? (
                    <DropdownMenuItem asChild className="h-11 rounded-xl">
                      <Link to="/post" search={{ edit: item.id }}>
                        <PenLine className="mr-2 size-4" /> Edit
                      </Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem className="h-11 rounded-xl" onSelect={onEdit}>
                      <PenLine className="mr-2 size-4" /> Edit
                    </DropdownMenuItem>
                  )
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="h-11 rounded-xl text-destructive focus:text-destructive"
                  onSelect={onDelete}
                >
                  <Trash2 className="mr-2 size-4" /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {!isStory ? (
          <p className="mt-2 truncate text-[13px] text-muted-foreground">
            Replying to <span className="font-medium text-foreground">{item.storyTitle}</span>
          </p>
        ) : null}
        {heading ? (
          <h2 className="mt-2 font-display text-xl font-semibold leading-snug tracking-tight">
            {heading}
          </h2>
        ) : null}
        {item.body && !(item.type === "comment" && item.isDeleted) ? (
          <p className="mt-1.5 line-clamp-3 text-[15px] leading-relaxed text-muted-foreground">
            {item.body}
          </p>
        ) : null}

        {state === "published" || (!isStory && canView) ? (
          <div className="-mb-1 mt-3 flex items-center justify-end gap-1">
            {canView ? (
              <Button asChild variant="ghost" className="h-11 rounded-full px-4 font-semibold">
                {viewLink(
                  <>
                    <Eye className="mr-1.5 size-4" /> View
                  </>,
                )}
              </Button>
            ) : null}
            {canEdit ? (
              isStory ? (
                <Button asChild variant="ghost" className="h-11 rounded-full px-4 font-semibold">
                  <Link to="/post" search={{ edit: item.id }}>
                    <PenLine className="mr-1.5 size-4" /> Edit
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  className="h-11 rounded-full px-4 font-semibold"
                  onClick={onEdit}
                >
                  <PenLine className="mr-1.5 size-4" /> Edit
                </Button>
              )
            ) : null}
          </div>
        ) : null}
      </div>

      {note ? (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3.5",
            state === "review"
              ? "border-amber-500/20 bg-amber-500/10"
              : "border-border bg-secondary/50",
          )}
        >
          <p className="min-w-0 flex-1 basis-60 text-sm leading-relaxed">{note}</p>
          {state === "hidden" && isStory && canEdit ? (
            <Button asChild className="h-11 rounded-full px-5">
              <Link to="/post" search={{ edit: item.id }}>
                Edit and resubmit
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
