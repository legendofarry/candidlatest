import { useState } from "react";
import { Bell, CheckCheck, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { notify } from "@/lib/notifications-store";
import {
  markNotificationsRead,
  NOTIFICATION_ACTIVITY_OPTIONS,
  setNotificationActivityEnabled,
  useNotifications,
  useNotificationPreferences,
} from "@/lib/notifications-store";

export function NotificationSettingsHub({ className }: { className?: string }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const notifications = useNotifications();
  const preferences = useNotificationPreferences();
  const unreadIds = notifications
    .filter(
      (notification) =>
        !notification.read &&
        !notification.archived &&
        preferences[notification.activityType ?? "other"],
    )
    .map((notification) => notification.id);

  function markInboxRead() {
    markNotificationsRead(unreadIds);
    notify.success("Visible inbox notifications marked as read.");
  }

  const content = (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
      <section>
        <div className="mb-3">
          <h3 className="font-display text-[15px] font-semibold tracking-tight">
            Show in your inbox
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Choose which activity appears in this device’s inbox. Hidden activity is kept and can be
            shown again anytime.
          </p>
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {NOTIFICATION_ACTIVITY_OPTIONS.map(({ id, label }) => (
            <label
              key={id}
              className="flex min-h-12 cursor-pointer items-center gap-3 px-3.5 py-2.5"
            >
              <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
              <Switch
                checked={preferences[id]}
                onCheckedChange={(checked) => setNotificationActivityEnabled(id, checked)}
                aria-label={`Show ${label.toLowerCase()} in inbox`}
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          These preferences are saved on this device. Push alerts are currently paused.
        </p>
      </section>

      <section>
        <div className="mb-3">
          <h3 className="font-display text-[15px] font-semibold tracking-tight">
            Inbox management
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Mark visible inbox notifications as read.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start rounded-xl"
          disabled={unreadIds.length === 0}
          onClick={markInboxRead}
        >
          <CheckCheck className="size-4" />
          Mark visible as read
          <span className="ml-auto text-xs text-muted-foreground">{unreadIds.length} unread</span>
        </Button>
      </section>
    </div>
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Notification settings"
        title="Notification settings"
        className={className ?? "!size-10 rounded-full border-2 sm:!size-12"}
        onClick={() => setOpen(true)}
      >
        <Settings2 className="size-4" />
      </Button>
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent
            overlayClassName="z-[110]"
            className="!z-[110] flex h-[min(80dvh,38rem)] max-h-[90dvh] flex-col overflow-hidden rounded-t-[1.25rem] bg-background"
          >
            <DrawerTitle className="sr-only">Notification settings</DrawerTitle>
            <DrawerDescription className="sr-only">
              Choose which in-app notifications appear in your inbox and manage unread activity.
            </DrawerDescription>
            <div className="shrink-0 border-b border-border px-4 pb-3 pt-4 sm:px-6">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-primary" />
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Notification settings
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Choose what you see in your Candid inbox.
              </p>
            </div>
            {content}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            hideCloseButton
            className="flex max-h-[min(80dvh,38rem)] w-[min(30rem,94vw)] flex-col gap-0 overflow-hidden rounded-2xl bg-background p-0"
          >
            <DialogTitle className="sr-only">Notification settings</DialogTitle>
            <DialogDescription className="sr-only">
              Choose which in-app notifications appear in your inbox and manage unread activity.
            </DialogDescription>
            <div className="shrink-0 border-b border-border px-5 pb-3 pt-5">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-primary" />
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Notification settings
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Choose what you see in your Candid inbox.
              </p>
            </div>
            {content}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
