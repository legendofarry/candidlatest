import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useIsMobile } from "@/hooks/use-mobile";
import { getStory } from "@/lib/public.functions";
import { formatCount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CommentThread, type ThreadComment } from "@/components/site/comment-thread";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LoaderCircle, X } from "lucide-react";

type StoryCommentsSummary = {
  id: string;
  title: string;
  post_type: "workplace_story" | "announcement";
  comment_count: number;
};

export function ProfileStoryComments({
  story,
  open,
  onOpenChange,
}: {
  story: StoryCommentsSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const fetchStory = useServerFn(getStory);
  const thread = useQuery({
    queryKey: ["story", story?.id],
    queryFn: () => fetchStory({ data: { id: story?.id ?? "" } }),
    enabled: open && Boolean(story?.id),
    staleTime: 15_000,
  });
  const storyTitle =
    story?.post_type === "announcement" ? "Candid update" : story?.title || "Story comments";
  const total = thread.data?.commentTotal ?? story?.comment_count ?? 0;

  const content = thread.isPending ? (
    <div className="grid min-h-56 place-items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-5 animate-spin text-primary" />
      Loading comments…
    </div>
  ) : thread.isError || !thread.data ? (
    <div className="grid min-h-56 place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-medium">Comments couldn’t load.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void thread.refetch()}>
          Try again
        </Button>
      </div>
    </div>
  ) : (
    <CommentThread
      storyId={story!.id}
      comments={thread.data.comments as ThreadComment[]}
      total={total}
      commentsHasMore={thread.data.commentsHasMore}
      commentsCursor={thread.data.commentsCursor}
      panelMode
      fitContent={isMobile}
    />
  );

  return (
    <>
      <Drawer open={open && isMobile} onOpenChange={onOpenChange}>
        <DrawerContent className="h-auto max-h-[86dvh] overflow-hidden rounded-t-3xl p-0">
          <div className="flex min-h-0 flex-col">
            <DrawerHeader className="shrink-0 border-b border-border px-4 pb-3 pt-3 text-left">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <DrawerTitle>{formatCount(total)} comments</DrawerTitle>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{storyTitle}</p>
                </div>
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon" aria-label="Close comments">
                    <X className="size-4" />
                  </Button>
                </DrawerClose>
              </div>
            </DrawerHeader>
            <div className="min-h-0 overflow-hidden px-2 py-2">{content}</div>
          </div>
        </DrawerContent>
      </Drawer>

      <Sheet open={open && !isMobile} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <SheetHeader className="shrink-0 border-b border-border px-5 py-5 pr-14 text-left">
            <SheetTitle>{formatCount(total)} comments</SheetTitle>
            <SheetDescription className="line-clamp-2">{storyTitle}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-2 py-2">{content}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
