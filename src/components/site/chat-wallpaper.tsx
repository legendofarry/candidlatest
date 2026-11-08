import { useMemo } from "react";
import { getWallpaperLayers } from "@/lib/chat-wallpapers";
import type { MessageAppearance } from "@/lib/message-appearance";

/**
 * The wallpaper sits in its own layer behind the message list. Render it as the first child of a
 * `relative` wrapper around the scrolling message area, so the top bar, composer and inbox never see it.
 */
export function ChatWallpaper({ look }: { look: MessageAppearance }) {
  const { wallpaper, pack, wallpaperColor, gradient, patternOpacity, patternScale, patternBase, dim } = look;
  const layers = useMemo(
    () => getWallpaperLayers({ wallpaper, pack, wallpaperColor, gradient, patternOpacity, patternScale, patternBase, dim }),
    [wallpaper, pack, wallpaperColor, gradient, patternOpacity, patternScale, patternBase, dim],
  );
  return (
    <div className="chat-wallpaper" aria-hidden>
      {layers.base ? <div className="chat-wallpaper__base" style={{ background: layers.base }} /> : null}
      {layers.pattern ? (
        <div
          className="chat-wallpaper__pattern"
          style={{
            WebkitMaskImage: layers.pattern.tile,
            maskImage: layers.pattern.tile,
            WebkitMaskSize: `${layers.pattern.size}px`,
            maskSize: `${layers.pattern.size}px`,
            opacity: layers.pattern.opacity,
            ...(layers.pattern.ink ? ({ "--chat-wallpaper-ink": layers.pattern.ink } as React.CSSProperties) : {}),
          }}
        />
      ) : null}
      {layers.dim > 0 ? <div className="chat-wallpaper__dim" style={{ opacity: layers.dim }} /> : null}
    </div>
  );
}
