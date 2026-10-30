import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Eye, EyeOff, LoaderCircle, PenLine, Trash2 } from "lucide-react";
import { deleteStory } from "@/lib/actions.functions";
import { getMyContributions } from "@/lib/social.functions";
import { useAuth } from "@/hooks/useAuth";
import { notify } from "@/lib/notifications-store";
import { formatCount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Drawer,
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

type StoryStatus = "all" | "published" | "pending" | "hidden";
type StoryItem = {
  id: string;
  type: "story";
  title: string;
  body: string;
  createdAt: string;
  status: string;
  storyId: string;
  companyName: string | null;
  authorDeleted: boolean;
};
type StoryCursor = {
  stories: { createdAt: string; id: string } | null;
  comments: { createdAt: string; id: string } | null;
} | null;

const statusOptions: { value: StoryStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "pending", label: "In review" },
  { value: "hidden", label: "Hidden" },
];

export function ManageProfileStoriesSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fetchStories = useServerFn(getMyContributions);
  const removeStory = useServerFn(deleteStory);
  const [status, setStatus] = useState<StoryStatus>("all");
  const [deleting, setDeleting] = useState<StoryItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const stories = useInfiniteQuery({
    queryKey: ["manage-profile-stories", user?.uid ?? null, status],
    queryFn: ({ pageParam }) =>
      fetchStories({
        data: { limit: 20, category: "stories", status, cursor: pageParam },
      }),
    initialPageParam: null as StoryCursor,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(open && user),
    staleTime: 20_000,
  });
  const items = (stories.data?.pages.flatMap((page) => page.items) ?? []) as StoryItem[];
  const total = stories.data?.pages[0]?.counts.stories ?? 0;

  async function confirmDelete() {
    if (!deleting || !user || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await removeStory({ data: { story_id: deleting.id } });
      setDeleting(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["manage-profile-stories", user.uid] }),
        queryClient.invalidateQueries({ queryKey: ["my-contributions", user.uid] }),
        queryClient.invalidateQueries({ queryKey: ["public-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["stories"] }),
        queryClient.invalidateQueries({ queryKey: ["story-pages"] }),
        queryClient.invalidateQueries({ queryKey: ["company-scores"] }),
        queryClient.invalidateQueries({ queryKey: ["onboarding-state", user.uid] }),
      ]);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not delete this story.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[94dvh] max-h-[94dvh] gap-0 overflow-hidden rounded-t-[1.6rem] border-border bg-background p-0 pb-[env(safe-area-inset-bottom)]">
          <DrawerHeader className="shrink-0 border-b border-border px-5 pb-4 pt-3 text-left">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DrawerTitle className="font-display text-2xl">Your stories</DrawerTitle>
                <DrawerDescription className="mt-1">
                  {formatCount(total)} {total === 1 ? "story" : "stories"} · View, edit or remove
                  your posts.
                </DrawerDescription>
              </div>
              <span className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <PenLine className="size-5" />
              </span>
            </div>
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={status === option.value}
                  onClick={() => setStatus(option.value)}
                  className={`min-h-9 shrink-0 rounded-full border px-4 text-sm transition-colors ${
                    status === option.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {stories.isLoading ? (
              <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin" /> Loading your stories…
              </div>
            ) : stories.isError ? (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-muted-foreground">Couldn’t load your stories.</p>
                <Button variant="outline" onClick={() => void stories.refetch()}>
                  Try again
                </Button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-8 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <PenLine className="size-5" />
                </span>
                <h3 className="mt-4 font-semibold">
                  {status === "all" ? "No stories yet" : `No ${statusOptions.find((x) => x.value === status)?.label.toLowerCase()} stories`}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your stories will appear here once you share them.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {items.map((story) => {
                  const canView = story.status === "published";
                  const canEdit = !story.authorDeleted;
                  const statusLabel = story.authorDeleted
                    ? "Removed by you"
                    : story.status === "pending"
                      ? "In review"
                      : story.status === "published"
                        ? "Published"
                        : "Hidden";
                  return (
                    <article key={story.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {story.companyName || "Workplace story"}
                          </p>
                          <h3 className="mt-1 text-base font-semibold leading-snug">{story.title}</h3>
                        </div>
                        <span className="shrink-0 pt-0.5 text-[11px] font-medium text-muted-foreground">
                          {statusLabel}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                        {story.body}
                      </p>
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="size-3.5" />
                        {story.createdAt
                          ? new Date(story.createdAt).toLocaleDateString("en-KE", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "Date unavailable"}
                      </p>
                      <div className="mt-3 flex items-center gap-5 border-t border-border pt-2">
                        {canView ? (
                          <Link
                            to="/stories/$id"
                            params={{ id: story.storyId }}
                            onClick={() => onOpenChange(false)}
                            className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary"
                          >
                            <Eye className="size-4" /> View
                          </Link>
                        ) : (
                          <span className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
                            <EyeOff className="size-4" /> Not public
                          </span>
                        )}
                        {canEdit ? (
                          <Link
                            to="/post"
                            search={{ edit: story.id }}
                            onClick={() => onOpenChange(false)}
                            className="inline-flex min-h-10 items-center gap-2 text-sm font-medium"
                          >
                            <PenLine className="size-4" /> Edit
                          </Link>
                        ) : null}
                        {!story.authorDeleted ? (
                          <button
                            type="button"
                            onClick={() => setDeleting(story)}
                            className="ml-auto inline-flex min-h-10 items-center gap-2 text-sm font-medium text-danger"
                          >
                            <Trash2 className="size-4" /> Delete
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {stories.hasNextPage ? (
              <div className="flex justify-center border-t border-border px-4 py-4">
                <Button
                  variant="ghost"
                  className="min-h-11 w-full"
                  disabled={stories.isFetchingNextPage}
                  onClick={() => void stories.fetchNextPage()}
                >
                  {stories.isFetchingNextPage ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
                  {stories.isFetchingNextPage ? "Loading…" : "Load more stories"}
                </Button>
              </div>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => {
          if (!next && !deleteBusy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this story?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from public Candid feeds. The story record is retained for
              moderation and reporting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Keep story</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteBusy ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
              Delete story
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
