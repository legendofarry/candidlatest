import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, MessageSquareText, Palette, RotateCcw, Settings2, ShieldCheck, Wrench, X, type LucideIcon } from "lucide-react";
import { getPrivacySettings } from "@/lib/messaging.functions";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  effectiveLook,
  hasOverride,
  presetLook,
  resetChatLook,
  updateChatBehavior,
  updateChatLook,
  useChatPrefs,
  type AppearancePreset,
  type MessageAppearance,
} from "@/lib/message-appearance";
import { notify } from "@/lib/notifications-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { PREMIUM_PRESETS } from "@/lib/message-appearance";
import { AppearanceSection } from "./appearance";
import { Segmented } from "./controls";
import { BehaviourSection, NotificationsSection, PrivacySection, ToolsSection, type HubChat } from "./sections";

type SectionId = "appearance" | "behaviour" | "notifications" | "privacy" | "tools";

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "behaviour", label: "Chat behaviour", icon: MessageSquareText },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "privacy", label: "Privacy & safety", icon: ShieldCheck },
  { id: "tools", label: "Chat tools", icon: Wrench },
];

/**
 * The chat settings hub. Inside a conversation it opens on "This chat"; from the inbox it edits the
 * defaults for all chats. Appearance and behaviour sync to the member's account.
 */
export function ChatSettingsHub({ className, chat = null }: { className?: string; chat?: HubChat | null }) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const fetchPrivacy = useServerFn(getPrivacySettings);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SectionId>("appearance");
  const [scope, setScope] = useState<"chat" | "all">(chat ? "chat" : "all");
  const userId = user?.uid ?? null;
  const prefs = useChatPrefs(userId);
  const privacy = useQuery({ queryKey: ["privacy-settings", "hub"], queryFn: () => fetchPrivacy(), enabled: Boolean(user && open) });

  const scopeIsChat = Boolean(chat) && scope === "chat";
  const conversationId = scopeIsChat ? chat!.conversationId : null;
  const look = scopeIsChat ? effectiveLook(prefs, chat!.conversationId) : prefs.look;
  const overridden = hasOverride(prefs, chat?.conversationId);
  const premium = privacy.data ? privacy.data.membership_tier !== "basic" : false;
  const contactName = chat?.partner ? `@${chat.partner.username}` : "Your friend";
  const scopeLabel = scopeIsChat ? (chat?.partner ? `@${chat.partner.username}` : "This chat") : "All chats";

  function editLook(partial: Partial<MessageAppearance>) {
    if (!userId) return;
    updateChatLook(userId, partial, conversationId);
  }
  function choosePreset(preset: AppearancePreset) {
    if (PREMIUM_PRESETS.has(preset) && !premium) {
      notify.error("This chat theme is available with Premium.");
      return;
    }
    editLook(presetLook(preset));
  }
  function resetScope() {
    if (!userId) return;
    resetChatLook(userId, conversationId);
  }
  function close() {
    setOpen(false);
  }

  const available = SECTIONS;

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-3 sm:px-6">
      {section === "appearance" ? (
        <AppearanceSection
          look={look}
          behavior={prefs.behavior}
          contactName={contactName}
          premium={premium}
          scopeLabel={scopeLabel}
          overridden={overridden}
          scopeIsChat={scopeIsChat}
          onLook={editLook}
          onPreset={choosePreset}
          onBehavior={(partial) => userId && updateChatBehavior(userId, partial)}
          onResetScope={resetScope}
        />
      ) : null}
      {section === "behaviour" ? <BehaviourSection behavior={prefs.behavior} onBehavior={(partial) => userId && updateChatBehavior(userId, partial)} /> : null}
      {section === "notifications" ? <NotificationsSection chat={chat} /> : null}
      {section === "privacy" ? <PrivacySection chat={chat} onClose={close} /> : null}
      {section === "tools" ? <ToolsSection chat={chat} onClose={close} /> : null}
      {section === "appearance" && !scopeIsChat ? (
        <button
          type="button"
          onClick={resetScope}
          className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-4" /> Reset my default look
        </button>
      ) : null}
      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Your chat look and behaviour are private to you and follow you across your devices. They don’t change what other people see.
      </p>
    </div>
  );

  const header = (
    <div className="shrink-0 border-b border-border px-4 pb-3 pt-4 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold tracking-tight">Chat settings</h2>
          <p className="truncate text-xs text-muted-foreground">{chat?.partner ? `Chat with @${chat.partner.username}` : "All your chats"}</p>
        </div>
        <button type="button" aria-label="Close chat settings" onClick={close} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      {chat && section === "appearance" ? (
        <div className="mt-3">
          <Segmented
            label="Which chats to change"
            value={scope}
            onChange={setScope}
            options={[
              { value: "chat", label: "This chat" },
              { value: "all", label: "All chats" },
            ]}
          />
        </div>
      ) : null}
    </div>
  );

  const nav = (
    <nav
      aria-label="Chat settings sections"
      className={cn(
        isMobile
          ? "flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-4 py-2 [scrollbar-width:none]"
          : "flex w-52 shrink-0 flex-col gap-1 border-r border-border p-3",
      )}
    >
      {available.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={section === id ? "page" : undefined}
          onClick={() => setSection(id)}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-xl text-sm font-medium transition-colors",
            isMobile ? "rounded-full px-3 py-1.5" : "px-3 py-2.5",
            section === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </nav>
  );

  const content = (
    <div className={cn("flex min-h-0 flex-1", isMobile ? "flex-col" : "flex-row")}>
      {nav}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header}
        {body}
      </div>
    </div>
  );

  return (
    <>
      <Button type="button" variant="ghost" size="icon" aria-label="Chat settings" title="Chat settings" className={cn("shrink-0 rounded-full", className)} onClick={() => setOpen(true)}>
        <Settings2 className="size-5" />
      </Button>
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="h-[94dvh] max-h-[94dvh] overflow-hidden rounded-t-[1.25rem] bg-background">
            <DrawerTitle className="sr-only">Chat settings</DrawerTitle>
            <DrawerDescription className="sr-only">Appearance, behaviour, notifications, privacy and tools for your chats.</DrawerDescription>
            {content}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent hideCloseButton className="flex h-[min(90dvh,52rem)] w-[min(58rem,96vw)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl bg-background p-0">
            <DialogTitle className="sr-only">Chat settings</DialogTitle>
            <DialogDescription className="sr-only">Appearance, behaviour, notifications, privacy and tools for your chats.</DialogDescription>
            {content}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
