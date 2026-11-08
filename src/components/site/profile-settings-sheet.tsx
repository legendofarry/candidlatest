import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ProfileCoverPicker, ProfilePhotoPicker } from "@/components/site/profile-photo";
import { useIsMobile } from "@/hooks/use-mobile";

type ProfileSettingsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string | null;
  photoUrl?: string | null;
  coverUrl?: string | null;
  onPhotoSaved: (photoUrl: string) => void;
  onCoverSaved: (coverUrl: string) => void;
  onEditUsername: () => void;
};

function ProfileSettingsContent({
  username,
  photoUrl,
  coverUrl,
  onPhotoSaved,
  onCoverSaved,
  onEditUsername,
}: Omit<ProfileSettingsSheetProps, "open" | "onOpenChange">) {
  const initials = (username?.[0] ?? "U").toUpperCase();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <section className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
        <ProfilePhotoPicker
          compact
          avatarOnly
          photoUrl={photoUrl}
          initials={initials}
          avatarClassName="size-16 border-2 border-background shadow-md"
          onSaved={onPhotoSaved}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Public username
          </p>
          <p className="mt-1 truncate font-semibold">{username ? `@${username}` : "Not set"}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-xl"
          onClick={onEditUsername}
        >
          <Pencil className="size-4" />
          {username ? "Edit" : "Choose"}
        </Button>
      </section>

      <section>
        <div className="mb-3">
          <h3 className="font-semibold">Profile cover</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the image people see at the top of your profile.
          </p>
        </div>
        <div className="relative h-40 overflow-hidden rounded-2xl border border-border bg-muted">
          <ProfileCoverPicker coverUrl={coverUrl} onSaved={onCoverSaved} />
        </div>
      </section>

      <p className="rounded-2xl bg-primary/5 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        Your username, profile photo and cover are visible to other people. Your sign-in email is
        not shown on your profile.
      </p>
    </div>
  );
}

export function ProfileSettingsSheet(props: ProfileSettingsSheetProps) {
  const isMobile = useIsMobile();
  const content = <ProfileSettingsContent {...props} />;

  if (isMobile) {
    return (
      <Drawer open={props.open} onOpenChange={props.onOpenChange}>
        <DrawerContent
          overlayClassName="!z-[199]"
          className="!fixed !inset-0 !z-[200] !mt-0 !h-[100dvh] !max-h-[100dvh] !rounded-none border-0 bg-background p-0 pb-[env(safe-area-inset-bottom)] [&>div:first-child]:mt-2 [&>div:first-child]:h-1 [&>div:first-child]:w-10 [&>div:first-child]:bg-muted-foreground/30"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <DrawerHeader className="shrink-0 border-b border-border px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] text-left">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <DrawerTitle className="font-display text-xl">Profile settings</DrawerTitle>
                  <DrawerDescription className="mt-1">
                    Manage what people see on your profile.
                  </DrawerDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close profile settings"
                  className="-mr-2 -mt-2 size-10 shrink-0 rounded-full"
                  onClick={() => props.onOpenChange(false)}
                >
                  <X className="size-5" />
                </Button>
              </div>
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{content}</div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        hideCloseButton
        className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-3xl p-0"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 text-left">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="font-display text-xl">Profile settings</DialogTitle>
              <DialogDescription className="mt-1">
                Manage what people see on your profile.
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close profile settings"
              className="-mr-2 -mt-2 size-9 shrink-0 rounded-full"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">{content}</div>
      </DialogContent>
    </Dialog>
  );
}
