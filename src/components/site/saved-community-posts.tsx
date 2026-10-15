import { Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, ChevronRight, Image, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getSavedCommunityPosts } from "@/lib/social.functions";
import { formatDate } from "@/components/site/story-card";

const PAGE_SIZE = 20;

export function SavedCommunityPosts() {
  const { user } = useAuth();
  const fetchPage = useServerFn(getSavedCommunityPosts);
  const posts = useInfiniteQuery({
    queryKey: ["saved-community-posts", user?.uid ?? null],
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: ({ pageParam }) => fetchPage({ data: { limit: PAGE_SIZE, cursor: pageParam } }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: Boolean(user),
  });
  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];

  if (!user) return null;

  return (
    <section className="border-b border-border py-5 md:rounded-2xl md:border md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bookmark className="size-5" />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Your library
          </p>
          <h2 className="font-display text-lg font-semibold">Saved Candid updates</h2>
        </div>
      </div>

      {posts.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading saved updates…</p>
      ) : items.length ? (
        <ul className="mt-3 divide-y divide-border/70">
          {items.map((post) => (
            <li key={post.id}>
              <Link
                to="/stories/$id"
                params={{ id: post.id }}
                className="flex items-center gap-3 py-3 hover:text-primary"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                  {post.media.length ? (
                    <Image className="size-4" />
                  ) : (
                    <Bookmark className="size-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {post.body?.trim().slice(0, 100) || "Candid update"}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {formatDate(post.created_at)}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Updates you save will appear here.</p>
      )}

      {posts.hasNextPage ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-2"
          disabled={posts.isFetchingNextPage}
          onClick={() => void posts.fetchNextPage()}
        >
          {posts.isFetchingNextPage ? <LoaderCircle className="size-4 animate-spin" /> : null}
          Load more saved updates
        </Button>
      ) : null}
    </section>
  );
}
