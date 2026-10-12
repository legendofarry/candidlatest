import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Eye, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveMyProfilePhoto } from "@/lib/onboarding.functions";
import { notify } from "@/lib/notifications-store";
import { PRESET_AVATARS, presetAvatarUrl } from "@/lib/preset-avatars";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
function avatarDeliveryUrl(url: string) {
  return url.startsWith("/")
    ? url
    : url.replace("/upload/", "/upload/c_fill,g_face,ar_1:1,w_512,h_512,q_auto,f_auto/");
}

export function ProfileAvatar({
  photoUrl,
  initials,
  className = "",
  fallbackClassName = "",
}: {
  photoUrl?: string | null | undefined;
  initials: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);
  return photoUrl && !failed ? (
    <img
      src={avatarDeliveryUrl(photoUrl)}
      alt=""
      onError={() => setFailed(true)}
      className={`aspect-square rounded-full object-cover ${className}`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`flex aspect-square items-center justify-center rounded-full bg-primary/15 font-semibold text-primary ${className} ${fallbackClassName}`}
    >
      {initials || "?"}
    </span>
  );
}

export function ProfilePhotoPicker({
  photoUrl,
  initials,
  onSaved,
  compact = false,
  avatarOnly = false,
}: {
  photoUrl?: string | null | undefined;
  initials: string;
  onSaved: (photoUrl: string) => void;
  compact?: boolean;
  avatarOnly?: boolean;
}) {
  const savePhoto = useServerFn(saveMyProfilePhoto);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function selectFile(next: File | undefined) {
    setError(null);
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      setError("Choose an image file.");
      setActionsOpen(true);
      return;
    }
    if (next.size > MAX_FILE_SIZE) {
      setError("That image is over 20 MB. Choose a smaller file or a character avatar.");
      setActionsOpen(true);
      return;
    }
    setFile(next);
    setActionsOpen(true);
  }

  async function compressImage(input: File) {
    let source: CanvasImageSource;
    let width: number;
    let height: number;
    let release = () => {};
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(input);
        source = bitmap;
        width = bitmap.width;
        height = bitmap.height;
        release = () => bitmap.close();
      } catch {
        ({ source, width, height, release } = await loadImageElement(input));
      }
    } else {
      ({ source, width, height, release } = await loadImageElement(input));
    }
    const edge = 640;
    const scale = Math.min(1, edge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      release();
      throw new Error("This browser could not process the image.");
    }
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    release();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    if (!blob) throw new Error("This browser could not process the image.");
    return blob;
  }

  function loadImageElement(input: File): Promise<{
    source: CanvasImageSource;
    width: number;
    height: number;
    release: () => void;
  }> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(input);
      const image = new Image();
      image.onload = () =>
        resolve({
          source: image,
          width: image.naturalWidth,
          height: image.naturalHeight,
          release: () => URL.revokeObjectURL(objectUrl),
        });
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(
          new Error(
            "This phone could not open that image. Try a JPG or PNG, or choose a character avatar.",
          ),
        );
      };
      image.src = objectUrl;
    });
  }

  async function upload() {
    if (!file || uploading) return;
    const cloudName = import.meta.env["VITE_CLOUDINARY_CLOUD_NAME"]?.trim();
    const uploadPreset = import.meta.env["VITE_CLOUDINARY_UPLOAD_PRESET"]?.trim();
    if (!cloudName || !uploadPreset) {
      setError(
        "Profile photo uploads are not configured yet. You can skip this and add a photo later.",
      );
      return;
    }
    setUploading(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const image = await compressImage(file);
      const form = new FormData();
      form.append("file", image, "profile.jpg");
      form.append("upload_preset", uploadPreset);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
        {
          method: "POST",
          body: form,
          signal: controller.signal,
        },
      );
      const result = (await response.json()) as {
        secure_url?: string;
        error?: { message?: string };
      };
      if (!response.ok || !result.secure_url) {
        throw new Error(result.error?.message || "Cloudinary could not upload that image.");
      }
      const saved = await savePhoto({ data: { photoUrl: result.secure_url } });
      onSaved(saved.photoUrl);
      setFile(null);
      setActionsOpen(false);
    } catch (uploadError) {
      if (controller.signal.aborted) return;
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed. Try again.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setUploading(false);
    }
  }

  async function choosePresetAvatar(id: (typeof PRESET_AVATARS)[number]) {
    if (savingPreset) return;
    setSavingPreset(true);
    setError(null);
    try {
      const saved = await savePhoto({ data: { photoUrl: presetAvatarUrl(id) } });
      onSaved(saved.photoUrl);
      setFile(null);
      setActionsOpen(false);
    } catch (avatarError) {
      setError(avatarError instanceof Error ? avatarError.message : "Could not save that avatar.");
    } finally {
      setSavingPreset(false);
    }
  }

  function cancelUpload() {
    abortRef.current?.abort();
    abortRef.current = null;
    setUploading(false);
    setError("Upload cancelled. You can try again or continue without a photo.");
  }

  function openFilePicker() {
    setError(null);
    setActionsOpen(false);
    // Wait for the action dialog to close before opening the native file picker.
    window.setTimeout(() => inputRef.current?.click(), 0);
  }

  return (
    <div
      className={
        avatarOnly
          ? "inline-flex"
          : compact
            ? "flex flex-col gap-3 sm:flex-row sm:items-center"
            : "space-y-4"
      }
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="View or update profile photo"
          aria-haspopup="dialog"
          onPointerUp={() => setActionsOpen(true)}
          onClick={() => setActionsOpen(true)}
          className="group relative z-10 shrink-0 cursor-pointer pointer-events-auto rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <ProfileAvatar
            photoUrl={previewUrl ?? photoUrl}
            initials={initials}
            className={`${compact ? "size-14 border border-border" : "size-20 border-2 border-border"} transition-opacity group-hover:opacity-80`}
          />
          <span className="absolute bottom-0 right-0 grid size-6 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm">
            <Camera className="size-3" />
          </span>
        </button>
        {!avatarOnly ? (
          <div className="min-w-0">
            <p className="font-medium">{photoUrl ? "Profile photo" : "Add a profile photo"}</p>
            <p className="text-xs text-muted-foreground">
              {compact
                ? "Tap photo to view or update"
              : "Optional · tap photo to view or update · images up to 20 MB"}
            </p>
          </div>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          selectFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <Dialog open={actionsOpen} onOpenChange={setActionsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{file ? "Update profile photo" : "Profile photo"}</DialogTitle>
            <DialogDescription>
              {file
                ? "Check the preview, then decide whether to upload it."
                : "View your photo, choose an illustration, or select a character avatar."}
            </DialogDescription>
          </DialogHeader>
          <p
            role="note"
            className="rounded-xl border border-border bg-secondary/50 p-3 text-sm leading-relaxed text-muted-foreground"
          >
            Your profile photo is public and appears beside your posts and comments. A real photo
            could make you recognizable even when you use an alias. Adding a photo is optional; you
            can use an illustration or leave it blank.
          </p>
          <div className="flex flex-col items-center gap-4 py-2">
            <ProfileAvatar
              photoUrl={previewUrl ?? photoUrl}
              initials={initials}
              className="size-36 border-2 border-border shadow-sm"
            />
            {file ? (
              <p className="max-w-full truncate text-sm text-muted-foreground">{file.name}</p>
            ) : null}
          </div>
          {!file ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Choose a character avatar</p>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_AVATARS.map((id) => {
                  const url = presetAvatarUrl(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={savingPreset || uploading}
                      aria-label={`Use ${id.replace("candid-", "")} character avatar`}
                      title={`Use ${id.replace("candid-", "")} avatar`}
                      onClick={() => void choosePresetAvatar(id)}
                      className="rounded-full outline-none ring-offset-2 transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                    >
                      <img src={url} alt="" className="aspect-square w-full rounded-full" />
                    </button>
                  );
                })}
              </div>
              {savingPreset ? (
                <p className="text-xs text-muted-foreground">Saving avatar…</p>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:flex-row sm:justify-center sm:space-x-0">
            {file ? (
              <>
                {!uploading ? (
                  <Button type="button" variant="outline" onClick={openFilePicker}>
                    <Camera className="size-4" /> Choose another
                  </Button>
                ) : null}
                <Button type="button" onClick={() => void upload()} disabled={uploading}>
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {uploading ? "Uploading…" : "Upload photo"}
                </Button>
                {uploading ? (
                  <Button type="button" variant="ghost" onClick={cancelUpload}>
                    <X className="size-4" /> Cancel
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setFile(null);
                      setError(null);
                    }}
                  >
                    <RotateCcw className="size-4" /> Clear
                  </Button>
                )}
              </>
            ) : (
              <>
                {photoUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setActionsOpen(false);
                      setViewerOpen(true);
                    }}
                  >
                    <Eye className="size-4" /> View photo
                  </Button>
                ) : null}
                <Button type="button" onClick={openFilePicker}>
                  <Camera className="size-4" /> {photoUrl ? "Update photo" : "Add photo"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Profile photo</DialogTitle>
            <DialogDescription>
              This is the photo shown publicly on your Candid profile, beside your posts and
              comments.
            </DialogDescription>
          </DialogHeader>
          <p
            role="note"
            className="rounded-xl border border-border bg-secondary/50 p-3 text-sm leading-relaxed text-muted-foreground"
          >
            A real photo could make you recognizable even when you use an alias. Photos are
            optional; you can use an illustration or leave yours blank.
          </p>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="Your profile photo"
              className="mx-auto max-h-[65dvh] max-w-full rounded-xl object-contain"
            />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                setViewerOpen(false);
                setActionsOpen(true);
              }}
            >
              <Camera className="size-4" /> Update photo or avatar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
