import { useCallback, useEffect, useRef, useState } from "react";

type ScrollTarget = Window | HTMLElement;
type Expansion = {
  previousCount: number;
  anchorY: number;
  furthestY: number;
  target: ScrollTarget;
};
type ScrollSubscriber = (target: EventTarget | null) => void;
const subscribers = new Set<ScrollSubscriber>();
let scrollListenerAttached = false;

function onScroll(event: Event) {
  for (const subscriber of subscribers) subscriber(event.target);
}

function subscribeToScroll(subscriber: ScrollSubscriber) {
  subscribers.add(subscriber);
  if (!scrollListenerAttached) {
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    scrollListenerAttached = true;
  }
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && scrollListenerAttached) {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, true);
      scrollListenerAttached = false;
    }
  };
}

/** Reveals a list in batches, then hides each extra batch when the reader scrolls
 * back above where that batch was opened. Fetched rows stay in the query cache.
 */
export function useAutoCollapsingCount(initialCount: number) {
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const visibleCountRef = useRef(initialCount);
  const expansionsRef = useRef<Expansion[]>([]);

  const resetVisibleCount = useCallback(
    (count = initialCount) => {
      visibleCountRef.current = count;
      expansionsRef.current = [];
      setVisibleCount(count);
    },
    [initialCount],
  );

  const expandBy = useCallback((amount: number, anchor: HTMLElement | null) => {
    if (amount <= 0) return;
    const previousCount = visibleCountRef.current;
    let parent = anchor?.parentElement ?? null;
    let target: ScrollTarget = window;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (/(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`)) {
        target = parent;
        break;
      }
      parent = parent.parentElement;
    }
    const scrollTop = target === window ? window.scrollY : (target as HTMLElement).scrollTop;
    const anchorRect = anchor?.getBoundingClientRect();
    const targetTop = target === window ? 0 : (target as HTMLElement).getBoundingClientRect().top;
    const anchorY = anchorRect ? scrollTop + anchorRect.top - targetTop : scrollTop;
    expansionsRef.current.push({ previousCount, anchorY, furthestY: scrollTop, target });
    const nextCount = previousCount + amount;
    visibleCountRef.current = nextCount;
    setVisibleCount(nextCount);
  }, []);

  useEffect(() => {
    if (expansionsRef.current.length === 0) return;
    return subscribeToScroll((eventTarget) => {
      const expansions = expansionsRef.current;
      let nextCount = visibleCountRef.current;
      let changed = false;
      while (expansions.length > 0) {
        const latest = expansions[expansions.length - 1]!;
        if (
          eventTarget !== latest.target &&
          !(latest.target === window && eventTarget === document)
        )
          break;
        const scrollY =
          latest.target === window ? window.scrollY : (latest.target as HTMLElement).scrollTop;
        latest.furthestY = Math.max(latest.furthestY, scrollY);
        // Require the reader to move down through the newly revealed area before
        // scrolling back above its load point collapses that batch.
        if (latest.furthestY < latest.anchorY + 32 || scrollY > latest.anchorY - 24) break;
        expansions.pop();
        nextCount = latest.previousCount;
        changed = true;
      }
      if (changed) {
        visibleCountRef.current = nextCount;
        setVisibleCount(nextCount);
      }
    });
  }, [visibleCount]);

  return { visibleCount, expandBy, resetVisibleCount };
}
