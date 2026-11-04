import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Eye, Leaf, Palette, RotateCcw, Settings2, Waves, X } from "lucide-react";
import { getMessageTheme, getPrivacySettings, updateMessageTheme } from "@/lib/messaging.functions";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { notify } from "@/lib/notifications-store";
import {
  APPEARANCE_GRADIENTS,
  APPEARANCE_PALETTES,
  APPEARANCE_PRESETS,
  DEFAULT_MESSAGE_APPEARANCE,
  getMessageAppearanceStyle,
  updateMessageAppearance,
  useMessageAppearance,
  type AppearancePreset,
  type MessageAppearance as MessageAppearanceState,
} from "@/lib/message-appearance";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";

const PRESETS = APPEARANCE_PALETTES;

const SOLID_COLORS = ["#eee3cf", "#e2e8d5", "#dce8ed", "#f3dfda", "#222629"];
const GRADIENTS = APPEARANCE_GRADIENTS;
const BUBBLE_COLORS = [
  "#3c617c",
  "#c96f4a",
  "#3174a4",
  "#617c55",
  "#8b5a85",
  "#3e454f",
  "#e4a0a1",
  "#dfc9a8",
  "#eee3cf",
  "#a8c9de",
  "#25282b",
];
const THEME_TO_SERVER = {
  default: "default",
  cloud: "default",
  midnight: "midnight",
  matcha: "forest",
  sunset: "sunset",
  ocean: "ocean",
  "paper-doodles": "default",
} as const;
const PREMIUM_PRESETS = new Set<AppearancePreset>(["matcha", "sunset", "ocean"]);

function isCustomized(appearance: MessageAppearanceState) {
  const preset = PRESETS[appearance.preset];
  return (
    appearance.wallpaper !== preset.wallpaper ||
    (appearance.wallpaper === "solid" && appearance.wallpaperColor !== preset.surface) ||
    appearance.bubbleColor !== preset.outgoing ||
    appearance.patternIntensity !== "subtle" ||
    appearance.bubbleShape !== "standard" ||
    appearance.doodle !== "waves" ||
    appearance.gradient !== 0
  );
}

function textColor(hex: string) {
  const rgb = hex
    .match(/[\da-f]{2}/gi)
    ?.slice(0, 3)
    .map((part) => parseInt(part, 16)) ?? [0, 0, 0];
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150 ? "#202124" : "#ffffff";
}

function updateAppearance(
  userId: string | null,
  appearance: MessageAppearanceState,
  partial: Partial<MessageAppearanceState>,
) {
  updateMessageAppearance(userId, { ...appearance, ...partial });
}

function Preview({
  appearance,
  contactName,
}: {
  appearance: MessageAppearanceState;
  contactName: string;
}) {
  const preset = PRESETS[appearance.preset];
  return (
    <div
      className="appearance-chat-preview overflow-hidden rounded-2xl border"
      style={getMessageAppearanceStyle(appearance)}
      data-wallpaper={appearance.wallpaper}
      data-doodle={appearance.doodle}
      data-pattern-intensity={appearance.patternIntensity}
      data-bubble-shape={appearance.bubbleShape}
    >
      <header className="flex items-center gap-2.5 border-b px-3 py-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-sky-700 text-[10px] font-semibold text-white">
          {contactName.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{contactName}</span>
          <span className="block text-[10px] opacity-60">Active now</span>
        </span>
        <span className="text-sm opacity-60">⋮</span>
      </header>
      <div data-chat-area className="space-y-2.5 px-3 py-4">
        <p className="w-fit max-w-[82%] rounded-2xl rounded-bl-md border px-3 py-2 text-[11px] leading-relaxed">
          This is how the conversation will look.
        </p>
        <p
          className="ml-auto w-fit max-w-[82%] rounded-2xl rounded-br-md px-3 py-2 text-[11px] leading-relaxed text-white"
          style={{
            backgroundColor: appearance.bubbleColor,
            color: textColor(appearance.bubbleColor),
          }}
        >
          Nice — it updates instantly.
        </p>
        <p className="text-right text-[9px] opacity-60">9:41 AM · Read ✓✓</p>
      </div>
      <footer className="flex items-center gap-2 border-t px-3 py-2">
        <span className="text-base opacity-50">＋</span>
        <span className="flex-1 rounded-full border px-3 py-1 text-[10px] opacity-60">Message</span>
        <span
          className="flex size-6 items-center justify-center rounded-full text-[10px] text-white"
          style={{ backgroundColor: appearance.bubbleColor }}
        >
          ➤
        </span>
      </footer>
      <span className="sr-only">{preset.label} chat preview</span>
    </div>
  );
}

function ChoiceButton({
  active,
  children,
  onClick,
  className,
  label,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  className?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center rounded-xl border transition-colors hover:border-primary/60",
        active ? "border-primary ring-2 ring-primary/70 ring-offset-1" : "border-border",
        className,
      )}
    >
      {children}
      {active ? <Check className="absolute right-1.5 top-1.5 size-3.5 text-primary" /> : null}
    </button>
  );
}

export function MessageAppearanceSettings({
  className,
  contactName,
}: {
  className?: string;
  contactName?: string;
}) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const fetchTheme = useServerFn(getMessageTheme);
  const fetchPrivacy = useServerFn(getPrivacySettings);
  const saveTheme = useServerFn(updateMessageTheme);
  const [open, setOpen] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [finishingOpen, setFinishingOpen] = useState(false);
  const { data: themeData } = useQuery({
    queryKey: ["message-theme", user?.uid ?? null],
    queryFn: () => fetchTheme(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const appearance = useMessageAppearance(user?.uid ?? null, themeData?.theme);
  const {
    data: privacyData,
    isLoading: isLoadingPrivacy,
    isError: privacyError,
  } = useQuery({
    queryKey: ["privacy-settings", user?.uid ?? null],
    queryFn: () => fetchPrivacy(),
    enabled: Boolean(user && open),
  });
  const selectedPreset = appearance.preset;
  const chosenContact = contactName ?? "your chat";

  async function choosePreset(preset: AppearancePreset) {
    if (!user || savingPreset) return;
    if (PREMIUM_PRESETS.has(preset) && privacyData?.membership_tier === "basic") {
      notify.error("This chat theme is available with Premium.");
      return;
    }
    const previous = appearance;
    const presetDetails = PRESETS[preset];
    updateAppearance(user.uid, appearance, {
      preset,
      wallpaper: presetDetails.wallpaper,
      wallpaperColor: presetDetails.surface,
      bubbleColor: presetDetails.outgoing,
      doodle: "waves",
      patternIntensity: "subtle",
      bubbleShape: "standard",
      gradient: 0,
    });
    const serverTheme = THEME_TO_SERVER[preset];
    if (themeData?.theme === serverTheme) return;
    setSavingPreset(true);
    try {
      const result = await saveTheme({ data: { theme: serverTheme } });
      queryClient.setQueryData(["message-theme", user.uid], { theme: result.message_theme });
      await queryClient.invalidateQueries({ queryKey: ["privacy-settings", user.uid] });
    } catch (error) {
      updateMessageAppearance(user.uid, previous);
      notify.error(error instanceof Error ? error.message : "Could not change message appearance.");
    } finally {
      setSavingPreset(false);
    }
  }

  function resetAppearance() {
    if (!user) return;
    updateMessageAppearance(user.uid, DEFAULT_MESSAGE_APPEARANCE);
    void choosePreset("default");
  }

  const palette = PRESETS[appearance.preset];
  const custom = isCustomized(appearance);
  const themeOptions = (
    <div className="flex snap-x gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {APPEARANCE_PRESETS.map((presetId) => {
        const preset = PRESETS[presetId];
        const locked = PREMIUM_PRESETS.has(presetId) && privacyData?.membership_tier === "basic";
        const active = selectedPreset === presetId;
        return (
          <button
            key={presetId}
            type="button"
            disabled={savingPreset || locked || !privacyData}
            aria-pressed={active}
            onClick={() => void choosePreset(presetId)}
            className={cn(
              "w-[6.9rem] shrink-0 snap-start rounded-xl border p-2 text-left transition-colors",
              active
                ? "border-primary ring-2 ring-primary/70 ring-offset-1"
                : "border-border hover:border-primary/50",
              locked && "cursor-not-allowed opacity-50",
            )}
          >
            <span
              className="flex h-14 flex-col justify-between rounded-lg border p-1.5"
              style={{ background: preset.surface, borderColor: preset.border }}
            >
              <span className="h-2 w-10 rounded-full" style={{ background: preset.incoming }} />
              <span
                className="ml-auto h-2.5 w-7 rounded-full"
                style={{ background: preset.outgoing }}
              />
            </span>
            <span className="mt-1.5 flex items-center justify-between gap-1 text-[11px] font-medium">
              <span className="truncate">{preset.label}</span>
              {locked ? <span className="text-[8px] text-muted-foreground">PRO</span> : null}
              {active ? <Check className="size-3 shrink-0 text-primary" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );

  const content = (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-7 px-4 pb-8 pt-4 sm:px-6">
        <section>
          <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Eye className="size-3.5" /> Preview · only you can see this
          </p>
          <Preview appearance={appearance} contactName={chosenContact} />
        </section>

        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Themes</h3>
            {custom ? (
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium">
                Custom
              </span>
            ) : null}
          </div>
          {themeOptions}
          {custom ? (
            <p className="text-xs text-muted-foreground">
              Theme customized — pick a preset to return to it.
            </p>
          ) : null}
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Wallpaper</h3>
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Plain</p>
            <ChoiceButton
              label="Plain wallpaper"
              active={appearance.wallpaper === "plain"}
              onClick={() =>
                updateAppearance(user?.uid ?? null, appearance, { wallpaper: "plain" })
              }
              className="size-11"
            >
              <span className="text-lg text-muted-foreground">⊘</span>
            </ChoiceButton>
          </div>
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Solid color</p>
            <div className="flex flex-wrap gap-2">
              {SOLID_COLORS.map((color) => (
                <ChoiceButton
                  key={color}
                  label={`Solid wallpaper ${color}`}
                  active={appearance.wallpaper === "solid" && appearance.wallpaperColor === color}
                  onClick={() =>
                    updateAppearance(user?.uid ?? null, appearance, {
                      wallpaper: "solid",
                      wallpaperColor: color,
                    })
                  }
                  className="size-11"
                >
                  <span
                    className="size-full rounded-[0.65rem]"
                    style={{ backgroundColor: color }}
                  />
                </ChoiceButton>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Gradient</p>
            <div className="flex flex-wrap gap-2">
              {GRADIENTS.map((gradient, index) => (
                <ChoiceButton
                  key={gradient}
                  label={`Gradient wallpaper ${index + 1}`}
                  active={appearance.wallpaper === "gradient" && appearance.gradient === index}
                  onClick={() =>
                    updateAppearance(user?.uid ?? null, appearance, {
                      wallpaper: "gradient",
                      gradient: index,
                    })
                  }
                  className="size-11"
                >
                  <span className="size-full rounded-[0.65rem]" style={{ background: gradient }} />
                </ChoiceButton>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Doodles</p>
            <div className="flex gap-2">
              {(
                [
                  ["waves", <Waves className="size-5" />],
                  ["leaves", <Leaf className="size-5" />],
                  ["circles", <span className="size-5 rounded-full border-2" />],
                ] as const
              ).map(([doodle, icon]) => (
                <ChoiceButton
                  key={doodle}
                  label={`${doodle} doodle wallpaper`}
                  active={appearance.wallpaper === "doodles" && appearance.doodle === doodle}
                  onClick={() =>
                    updateAppearance(user?.uid ?? null, appearance, {
                      wallpaper: "doodles",
                      doodle,
                    })
                  }
                  className="size-11 bg-[#191c1f] text-white"
                >
                  {icon}
                </ChoiceButton>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Message colors</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Your messages. Incoming messages keep a neutral surface, and text color is chosen
              automatically so every bubble stays readable.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {BUBBLE_COLORS.map((color) => (
              <ChoiceButton
                key={color}
                label={`Outgoing message color ${color}`}
                active={appearance.bubbleColor === color}
                onClick={() =>
                  updateAppearance(user?.uid ?? null, appearance, { bubbleColor: color })
                }
                className="size-11"
              >
                <span className="size-full rounded-[0.65rem]" style={{ backgroundColor: color }} />
              </ChoiceButton>
            ))}
            <label
              className="relative flex size-11 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]"
              title="Choose a custom message color"
            >
              <input
                type="color"
                value={appearance.bubbleColor}
                aria-label="Choose a custom message color"
                onChange={(event) =>
                  updateAppearance(user?.uid ?? null, appearance, {
                    bubbleColor: event.target.value,
                  })
                }
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Current: {appearance.bubbleColor}</p>
        </section>

        <section className="border-t border-border pt-4">
          <button
            type="button"
            className="flex w-full items-center gap-3 text-left"
            aria-expanded={finishingOpen}
            onClick={() => setFinishingOpen((value) => !value)}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Finishing touches</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Optional — off by default
              </span>
            </span>
            <span className="text-muted-foreground">{finishingOpen ? "⌃" : "⌄"}</span>
          </button>
          {finishingOpen ? (
            <div className="mt-5 space-y-4">
              <fieldset>
                <legend className="mb-2 text-xs text-muted-foreground">
                  Pattern intensity (applies to Doodles wallpapers)
                </legend>
                <div className="flex w-fit rounded-xl border border-border p-1">
                  {(["off", "subtle", "more"] as const satisfies readonly PatternIntensity[]).map(
                    (value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={appearance.patternIntensity === value}
                        onClick={() =>
                          updateAppearance(user?.uid ?? null, appearance, {
                            patternIntensity: value,
                          })
                        }
                        className={cn(
                          "rounded-lg px-3 py-2 text-xs capitalize",
                          appearance.patternIntensity === value
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {value}
                      </button>
                    ),
                  )}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-xs text-muted-foreground">Bubble shape</legend>
                <div className="flex w-fit rounded-xl border border-border p-1">
                  {(["standard", "soft"] as const satisfies readonly BubbleShape[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={appearance.bubbleShape === value}
                      onClick={() =>
                        updateAppearance(user?.uid ?? null, appearance, { bubbleShape: value })
                      }
                      className={cn(
                        "rounded-lg px-3 py-2 text-xs capitalize",
                        appearance.bubbleShape === value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}
        </section>

        <div className="space-y-4 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={resetAppearance}
          >
            <RotateCcw className="mr-2 size-4" /> Reset to default
          </Button>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <span aria-hidden="true">♙</span>
            Your appearance choices are private to you and don’t change what others see.
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Appearance choices are saved in this browser only.
          </p>
        </div>
      </div>
    </div>
  );

  const panelHeader = (
    <div className="relative flex shrink-0 items-center justify-center border-b border-border px-12 py-4 text-center">
      <div>
        <h2 className="font-display text-base font-semibold">Chat appearance</h2>
        <p className="mt-1 text-sm text-muted-foreground">Just for you in {chosenContact}</p>
      </div>
      <button
        type="button"
        aria-label="Close chat appearance"
        onClick={() => setOpen(false)}
        className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <span className="sr-only">
        {palette.label}
        {custom ? " Custom" : ""}
      </span>
    </div>
  );
  const loadNotice = isLoadingPrivacy ? (
    <p role="status" className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
      Loading your appearance options…
    </p>
  ) : privacyError ? (
    <p role="alert" className="border-b border-destructive/30 px-4 py-2 text-xs text-destructive">
      Could not load Premium access. Close and reopen settings to retry.
    </p>
  ) : null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Message appearance settings"
        title="Message appearance settings"
        className={cn("shrink-0 rounded-full", className)}
        onClick={() => setOpen(true)}
      >
        <Settings2 className="size-5" />
      </Button>
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="h-[94dvh] max-h-[94dvh] overflow-hidden rounded-t-[1.25rem] bg-[#fbf8f2] text-[#292722] dark:bg-[#181818] dark:text-white">
            <DrawerTitle className="sr-only">Chat appearance</DrawerTitle>
            <DrawerDescription className="sr-only">
              Customize your personal chat preview, wallpaper and message colors.
            </DrawerDescription>
            {panelHeader}
            {loadNotice}
            {content}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            hideCloseButton
            className="flex h-[min(90dvh,60rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border-[#e7dfd1] bg-[#fbf8f2] p-0 text-[#292722] dark:border-border dark:bg-[#181818] dark:text-white"
          >
            <DialogTitle className="sr-only">Chat appearance</DialogTitle>
            <DialogDescription className="sr-only">
              Customize your personal chat preview, wallpaper and message colors.
            </DialogDescription>
            {panelHeader}
            {loadNotice}
            {content}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
