import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, UsersRound, X } from "lucide-react";
import { getPublicProfileFollowers } from "@/lib/messaging.functions";
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
}: {
  username: string;
  followerCount: number;
}) {
  const isMobile = useIsMobile();
  const fetchFollowers = useServerFn(getPublicProfileFollowers);
  const [open, setOpen] = useState(false);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const cursor = cursorHistory.at(-1) ?? null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    void fetchFollowers({ data: { username, cursor } })
      .then((page) => {
        if (cancelled) return;
        setMembers(page.followers as CommunityMember[]);
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
  }, [cursor, fetchFollowers, open, retry, username]);

  function openCommunity() {
    setCursorHistory([null]);
    setMembers([]);
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
              <p className="text-sm font-medium">This community couldn’t load.</p>
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
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card px-4 py-4 shadow-sm sm:px-5 sm:py-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <UsersRound className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold sm:text-xl">Community</h2>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              People following @{username}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className="font-display text-2xl font-bold leading-none tracking-tight sm:text-3xl"
              aria-label={`${followerCount.toLocaleString()} followers`}
              title={followerCount.toLocaleString()}
            >
              {formatCount(followerCount)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">followers</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
          <p className="text-xs text-muted-foreground">Your Candid community</p>
          <Button variant="outline" size="sm" className="rounded-full" onClick={openCommunity}>
            <UsersRound className="size-4" /> View community
          </Button>
        </div>
      </section>

      <Drawer open={open && isMobile} onOpenChange={setOpen}>
        <DrawerContent className="h-[84dvh] max-h-[90dvh] overflow-hidden rounded-t-3xl p-0">
          <div className="flex min-h-0 flex-1 flex-col">
            <DrawerHeader className="shrink-0 border-b border-border px-4 pb-4 pt-3 text-left">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <DrawerTitle>Community</DrawerTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatCount(followerCount)} people follow @{username}
                  </p>
                </div>
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon" aria-label="Close community">
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
            <SheetTitle>Community</SheetTitle>
            <SheetDescription>
              {formatCount(followerCount)} people follow @{username}
            </SheetDescription>
          </SheetHeader>
          {directoryBody}
        </SheetContent>
      </Sheet>
    </>
  );
}
