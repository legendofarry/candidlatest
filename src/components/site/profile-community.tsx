import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, UsersRound, X } from "lucide-react";
import { getPublicProfileConnections } from "@/lib/messaging.functions";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/site/profile-photo";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCount } from "@/lib/utils";

type CommunityMember = {
  id: string;
  username: string;
  photo_url: string | null;
};

export function ProfileCommunity({
  username,
  followerCount,
  followingCount,
}: {
  username: string;
  followerCount: number;
  followingCount: number;
}) {
  const isMobile = useIsMobile();
  const fetchConnections = useServerFn(getPublicProfileConnections);
  const [open, setOpen] = useState(false);
  const [listType, setListType] = useState<"followers" | "following">("followers");
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const cursor = cursorHistory.at(-1) ?? null;

  useEffect(() => {
    if (!open || !listType) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    void fetchConnections({ data: { username, kind: listType, cursor } })
      .then((page) => {
        if (cancelled) return;
        setMembers(page.members as CommunityMember[]);
        setHasMore(page.hasMore);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cursor, fetchConnections, listType, open, retry, username]);

  function openList(type: "followers" | "following") {
    setListType(type);
    setCursorHistory([null]);
    setMembers([]);
    setNextCursor(null);
    setHasMore(false);
    setLoading(true);
    setLoadError(false);
    setOpen(true);
  }

  function goToNextPage() {
    if (!nextCursor) return;
    setMembers([]);
    setLoading(true);
    setCursorHistory((history) => [...history, nextCursor]);
  }

  function goToPreviousPage() {
    if (cursorHistory.length <= 1) return;
    setMembers([]);
    setLoading(true);
    setCursorHistory((history) => history.slice(0, -1));
  }

  const directoryBody = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading ? (
          <div className="grid min-h-48 place-items-center px-5 text-sm text-muted-foreground">
            Loading members…
          </div>
        ) : loadError ? (
          <div className="grid min-h-48 place-items-center px-5 text-center">
            <div>
              <p className="text-sm font-medium">This list couldn’t load.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setRetry((v) => v + 1)}
              >
                Try again
              </Button>
            </div>
          </div>
        ) : members.length ? (
          <ul className="divide-y divide-border/70 px-4">
            {members.map((member) => (
              <li key={member.id}>
                <Link
                  to="/u/$username"
                  params={{ username: member.username }}
                  onClick={() => setOpen(false)}
                  className="flex min-h-16 items-center gap-3 py-2.5 transition-colors hover:bg-secondary/50"
                >
                  <ProfileAvatar
                    photoUrl={member.photo_url}
                    initials={member.username.slice(0, 2)}
                    className="size-10 shrink-0 border border-border"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    @{member.username}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid min-h-48 place-items-center px-6 text-center text-sm text-muted-foreground">
            No visible members on this page.
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          variant="outline"
          size="sm"
          disabled={loading || cursorHistory.length <= 1}
          onClick={goToPreviousPage}
        >
          <ArrowLeft className="size-4" /> Previous
        </Button>
        <span className="text-xs text-muted-foreground">Page {cursorHistory.length}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || !hasMore || !nextCursor}
          onClick={goToNextPage}
        >
          Next <ArrowRight className="size-4" />
        </Button>
      </div>
    </>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => openList("followers")}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          aria-label={`Open ${formatCount(followerCount)} followers`}
        >
          <UsersRound className="size-4 text-primary" />
          <span>{formatCount(followerCount)}</span>
          <span className="text-muted-foreground">followers</span>
        </button>
        <button
          type="button"
          onClick={() => openList("following")}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          aria-label={`Open ${formatCount(followingCount)} following`}
        >
          <UsersRound className="size-4 text-primary" />
          <span>{formatCount(followingCount)}</span>
          <span className="text-muted-foreground">following</span>
        </button>
      </div>

      <Drawer open={open && isMobile} onOpenChange={setOpen}>
        <DrawerContent className="h-[84dvh] max-h-[90dvh] overflow-hidden rounded-t-3xl p-0">
          <div className="flex min-h-0 flex-1 flex-col">
            <DrawerHeader className="shrink-0 border-b border-border px-4 pb-4 pt-3 text-left">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <DrawerTitle>{listType === "followers" ? "Followers" : "Following"}</DrawerTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {listType === "followers"
                      ? `${formatCount(followerCount)} people follow @${username}`
                      : `${formatCount(followingCount)} people @${username} follows`}
                  </p>
                </div>
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon" aria-label="Close list">
                    <X className="size-4" />
                  </Button>
                </DrawerClose>
              </div>
            </DrawerHeader>
            {directoryBody}
          </div>
        </DrawerContent>
      </Drawer>

      <Sheet open={open && !isMobile} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <SheetHeader className="shrink-0 border-b border-border px-5 py-5 pr-14">
            <SheetTitle>{listType === "followers" ? "Followers" : "Following"}</SheetTitle>
            <SheetDescription>
              {listType === "followers"
                ? `${formatCount(followerCount)} people follow @${username}`
                : `${formatCount(followingCount)} people @${username} follows`}
            </SheetDescription>
          </SheetHeader>
          {directoryBody}
        </SheetContent>
      </Sheet>
    </>
  );
}
