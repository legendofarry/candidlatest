import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveMyProfilePhoto } from "@/lib/onboarding.functions";
import { notify } from "@/lib/notifications-store";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function avatarDeliveryUrl(url: string) {
  return url.replace("/upload/", "/upload/c_fill,g_face,ar_1:1,w_512,h_512,q_auto,f_auto/");
}

export function ProfileAvatar({
  photoUrl,
  initials,
  className = "",
}: {
  photoUrl?: string | null;
  initials: string;
  className?: string;
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
      className={`flex aspect-square items-center justify-center rounded-full bg-primary/15 font-semibold text-primary ${className}`}
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
}: {
  photoUrl?: string | null;
  initials: string;
  onSaved: (photoUrl: string) => void;
  compact?: boolean;
}) {
  const savePhoto = useServerFn(saveMyProfilePhoto);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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
    if (!ACCEPTED_TYPES.has(next.type)) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (next.size > MAX_FILE_SIZE) {
      setError("That image is over 5 MB. Choose a smaller file.");
      return;
    }
    setFile(next);
  }

  async function compressImage(input: File) {
    const bitmap = await createImageBitmap(input);
    const edge = 640;
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not process the image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.86),
    );
    if (!blob) throw new Error("This browser could not process the image.");
    return blob;
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
      form.append("file", image, "profile.webp");
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
      notify.success("Profile photo updated.");
    } catch (uploadError) {
      if (controller.signal.aborted) return;
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed. Try again.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setUploading(false);
    }
  }

  function cancelUpload() {
    abortRef.current?.abort();
    abortRef.current = null;
    setUploading(false);
    setError("Upload cancelled. You can try again or continue without a photo.");
  }

  return (
    <div className={compact ? "flex flex-col gap-3 sm:flex-row sm:items-center" : "space-y-4"}>
      <div className="flex items-center gap-4">
        <ProfileAvatar
          photoUrl={previewUrl ?? photoUrl}
          initials={initials}
          className={compact ? "size-14 border border-border" : "size-20 border-2 border-border"}
        />
        <div className="min-w-0">
          <p className="font-medium">{photoUrl ? "Profile photo" : "Add a profile photo"}</p>
          <p className="text-xs text-muted-foreground">Optional · JPG, PNG or WebP · up to 5 MB</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          selectFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="size-4" />{" "}
          {file ? "Choose another" : photoUrl ? "Change photo" : "Choose photo"}
        </Button>
        {file ? (
          <Button type="button" onClick={() => void upload()} disabled={uploading}>
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {uploading ? "Uploading…" : "Upload photo"}
          </Button>
        ) : null}
        {uploading ? (
          <Button type="button" variant="ghost" onClick={cancelUpload}>
            <X className="size-4" /> Cancel
          </Button>
        ) : null}
        {file && !uploading ? (
          <Button type="button" variant="ghost" onClick={() => setFile(null)}>
            <RotateCcw className="size-4" /> Clear
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
