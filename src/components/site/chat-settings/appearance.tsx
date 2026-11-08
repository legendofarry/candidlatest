import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { ChatWallpaper } from "@/components/site/chat-wallpaper";
import {
  APPEARANCE_PALETTES,
  APPEARANCE_PRESETS,
  BUBBLE_COLORS,
  PREMIUM_PRESETS,
  getChatDataAttributes,
  getMessageAppearanceStyle,
  type AppearancePreset,
  type ChatBehavior,
  type MessageAppearance,
} from "@/lib/message-appearance";
import {
  WALLPAPER_GRADIENTS,
  WALLPAPER_PACKS,
  WALLPAPER_PACK_INFO,
  WALLPAPER_SOLIDS,
  wallpaperTileUrl,
} from "@/lib/chat-wallpapers";
import { cn } from "@/lib/utils";
import { ColorSwatch, Group, OptionTile, Row, SectionHeading, Segmented, SliderRow, ToggleRow } from "./controls";

/** A miniature of the real chat. It uses the same wallpaper layer and styles, so it is exactly what you will get. */
export function ChatPreview({ look, behavior, contactName }: { look: MessageAppearance; behavior: ChatBehavior; contactName: string }) {
  return (
    <div
      className="candid-message-theme overflow-hidden rounded-2xl border shadow-sm"
      style={{ ...getMessageAppearanceStyle(look), borderColor: "var(--chat-border)" }}
      {...getChatDataAttributes(look, behavior)}
    >
      <div data-chat-header className="flex items-center gap-2.5 border-b px-3 py-2">
        <span className="grid size-7 place-items-center rounded-full bg-primary/90 text-[10px] font-semibold text-primary-foreground">
          {contactName.replace("@", "").slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold">{contactName}</span>
          <span className="block text-[10px] opacity-60">Online</span>
        </span>
      </div>
      <div className="relative">
        <ChatWallpaper look={look} />
        <div data-chat-area data-chat-list className="relative z-10 flex flex-col px-3 py-3.5" style={{ color: "var(--chat-ink)" }}>
          <p className="candid-message-bubble candid-message-received candid-message-text mb-2 w-fit max-w-[80%] border px-3 py-1.5 leading-snug shadow-sm">
            Did you see the new wallpapers?
          </p>
          <p className="candid-message-bubble candid-message-sent candid-message-text mb-2 ml-auto w-fit max-w-[80%] px-3 py-1.5 leading-snug shadow-sm">
            Yes — the matatu pack is my favourite 🚌
          </p>
          <p className="candid-message-bubble candid-message-received candid-message-text w-fit max-w-[80%] border px-3 py-1.5 leading-snug shadow-sm">
            Same. It looks so clean.
          </p>
        </div>
      </div>
      <div data-chat-composer className="flex items-center gap-2 border-t px-3 py-2">
        <span className="flex-1 rounded-full border px-3 py-1 text-[11px] opacity-60" style={{ borderColor: "var(--chat-border)" }}>
          Write a message
        </span>
        <span className="grid size-6 place-items-center rounded-full text-[10px]" style={{ background: "var(--chat-outgoing)", color: "var(--chat-outgoing-ink)" }}>
          ➤
        </span>
      </div>
    </div>
  );
}

function PackThumb({ pack, selected }: { pack: (typeof WALLPAPER_PACKS)[number]; selected: boolean }) {
  const tile = useMemo(() => wallpaperTileUrl(pack), [pack]);
  return (
    <span className="relative block h-16 overflow-hidden rounded-lg bg-secondary">
      <span
        className="absolute inset-0 bg-foreground"
        style={{ opacity: selected ? 0.55 : 0.38, WebkitMaskImage: tile, maskImage: tile, WebkitMaskSize: "112px", maskSize: "112px" }}
      />
    </span>
  );
}

function BubbleShapeThumb({ shape, color }: { shape: "standard" | "soft" | "sharp"; color: string }) {
  const radius = shape === "soft" ? "0.9rem" : shape === "sharp" ? "0.25rem" : "0.7rem";
  return (
    <span className="flex h-16 flex-col justify-center gap-1.5 rounded-lg bg-secondary px-2">
      <span className="h-3.5 w-9 border border-border bg-card" style={{ borderRadius: radius }} />
      <span className="ml-auto h-3.5 w-11" style={{ borderRadius: radius, background: color }} />
    </span>
  );
}

export function AppearanceSection({
  look,
  behavior,
  contactName,
  premium,
  scopeLabel,
  overridden,
  scopeIsChat,
  onLook,
  onPreset,
  onBehavior,
  onResetScope,
}: {
  look: MessageAppearance;
  behavior: ChatBehavior;
  contactName: string;
  premium: boolean;
  scopeLabel: string;
  overridden: boolean;
  scopeIsChat: boolean;
  onLook: (partial: Partial<MessageAppearance>) => void;
  onPreset: (preset: AppearancePreset) => void;
  onBehavior: (partial: Partial<ChatBehavior>) => void;
  onResetScope: () => void;
}) {
  const wallpaperLabel = { plain: "None", solid: "Color", gradient: "Gradient", pattern: "Doodles" } as const;
  return (
    <div className="space-y-7">
      <div className="sticky top-0 z-20 -mx-4 bg-background/90 px-4 pb-3 pt-1 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Preview · {scopeLabel}
            {scopeIsChat && overridden ? <span className="ml-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Custom for this chat</span> : null}
          </span>
          {scopeIsChat && overridden ? (
            <button type="button" onClick={onResetScope} className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
              <RotateCcw className="size-3" /> Use my default
            </button>
          ) : null}
        </div>
        <ChatPreview look={look} behavior={behavior} contactName={contactName} />
      </div>

      <section>
        <SectionHeading title="Theme" hint="Sets colors and a matching wallpaper." />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {APPEARANCE_PRESETS.map((id) => {
            const palette = APPEARANCE_PALETTES[id];
            const locked = PREMIUM_PRESETS.has(id) && !premium;
            return (
              <OptionTile key={id} selected={look.preset === id} label={palette.label} badge={locked ? "PRO" : undefined} disabled={locked} onClick={() => onPreset(id)}>
                <span className="flex h-14 flex-col justify-between rounded-lg border p-1.5" style={{ background: palette.surface, borderColor: palette.border }}>
                  <span className="h-2 w-9 rounded-full" style={{ background: palette.incoming }} />
                  <span className="ml-auto h-2.5 w-7 rounded-full" style={{ background: palette.outgoing }} />
                </span>
              </OptionTile>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Wallpaper" hint="Only appears behind the messages, never the top or bottom bar." />
        <Segmented
          label="Wallpaper type"
          value={look.wallpaper}
          onChange={(wallpaper) => onLook({ wallpaper })}
          options={(Object.keys(wallpaperLabel) as (keyof typeof wallpaperLabel)[]).map((value) => ({ value, label: wallpaperLabel[value] }))}
        />

        {look.wallpaper === "pattern" ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WALLPAPER_PACKS.map((pack) => (
                <OptionTile key={pack} selected={look.pack === pack} label={WALLPAPER_PACK_INFO[pack].label} onClick={() => onLook({ pack })}>
                  <PackThumb pack={pack} selected={look.pack === pack} />
                </OptionTile>
              ))}
            </div>
            <Group>
              <SliderRow label="Doodle strength" value={look.patternOpacity} min={0} max={100} step={5} onChange={(patternOpacity) => onLook({ patternOpacity })} />
              <SliderRow label="Doodle size" value={look.patternScale} min={60} max={180} step={10} onChange={(patternScale) => onLook({ patternScale })} />
              <SliderRow label="Dim for night" value={look.dim} min={0} max={60} step={5} onChange={(dim) => onLook({ dim })} />
            </Group>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Background behind the doodles</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={look.patternBase === null}
                  onClick={() => onLook({ patternBase: null })}
                  className={cn("hub-tile h-9 rounded-full px-3 text-xs font-medium")}
                >
                  Theme
                </button>
                {WALLPAPER_SOLIDS.map((color) => (
                  <ColorSwatch key={color} color={color} label={`Background ${color}`} selected={look.patternBase === color} onClick={() => onLook({ patternBase: color })} />
                ))}
              </div>
            </div>
          </>
        ) : null}

        {look.wallpaper === "solid" ? (
          <div className="flex flex-wrap items-center gap-2">
            {WALLPAPER_SOLIDS.map((color) => (
              <ColorSwatch key={color} color={color} label={`Color ${color}`} selected={look.wallpaperColor === color} onClick={() => onLook({ wallpaperColor: color })} />
            ))}
            <label className="hub-tile flex h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-xs font-medium">
              Custom
              <input type="color" className="size-5 cursor-pointer rounded border-0 bg-transparent p-0" value={look.wallpaperColor} onChange={(event) => onLook({ wallpaperColor: event.target.value })} aria-label="Custom wallpaper color" />
            </label>
          </div>
        ) : null}

        {look.wallpaper === "gradient" ? (
          <div className="grid grid-cols-4 gap-2">
            {WALLPAPER_GRADIENTS.map((gradient, index) => (
              <OptionTile key={gradient.label} selected={look.gradient === index} label={gradient.label} onClick={() => onLook({ gradient: index })}>
                <span className="block h-14 rounded-lg" style={{ background: gradient.css }} />
              </OptionTile>
            ))}
          </div>
        ) : null}

        {look.wallpaper !== "pattern" && look.wallpaper !== "plain" ? (
          <Group>
            <SliderRow label="Dim for night" value={look.dim} min={0} max={60} step={5} onChange={(dim) => onLook({ dim })} />
          </Group>
        ) : null}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Messages" hint="How your bubbles look." />
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Your bubble color</p>
          <div className="flex flex-wrap items-center gap-2">
            {BUBBLE_COLORS.map((color) => (
              <ColorSwatch key={color} color={color} label={`Bubble ${color}`} selected={look.bubbleColor.toLowerCase() === color} onClick={() => onLook({ bubbleColor: color })} />
            ))}
            <label className="hub-tile flex h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-xs font-medium">
              Custom
              <input type="color" className="size-5 cursor-pointer rounded border-0 bg-transparent p-0" value={look.bubbleColor} onChange={(event) => onLook({ bubbleColor: event.target.value })} aria-label="Custom bubble color" />
            </label>
          </div>
          {look.preset === "default" ? (
            <p className="mt-2 text-xs text-muted-foreground">The Candid theme uses the app's own accent. Pick another theme to use a custom bubble color.</p>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["standard", "soft", "sharp"] as const).map((shape) => (
            <OptionTile key={shape} selected={look.bubbleShape === shape} label={shape === "standard" ? "Classic" : shape === "soft" ? "Soft" : "Sharp"} onClick={() => onLook({ bubbleShape: shape })}>
              <BubbleShapeThumb shape={shape} color={look.preset === "default" ? "var(--primary)" : look.bubbleColor} />
            </OptionTile>
          ))}
        </div>
        <Group>
          <ToggleRow label="Bubble tails" description="The pointed corner toward the sender." checked={look.bubbleTail} onChange={(bubbleTail) => onLook({ bubbleTail })} />
          <Row label="Text size" control={<span className="w-44"><Segmented label="Text size" value={look.textSize} onChange={(textSize) => onLook({ textSize })} options={[{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }]} /></span>} />
          <Row label="Message spacing" control={<span className="w-44"><Segmented label="Message spacing" value={behavior.density} onChange={(density) => onBehavior({ density })} options={[{ value: "comfortable", label: "Roomy" }, { value: "compact", label: "Compact" }]} /></span>} />
        </Group>
      </section>
    </div>
  );
}
