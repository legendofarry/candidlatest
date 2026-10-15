import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ImagePlus, LoaderCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { useAuth } from "@/hooks/useAuth";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { notify as toast } from "@/lib/notifications-store";
import { createCommunityPost, issueCommunityPostUpload } from "@/lib/community-post.functions";

const MAX_MEDIA = 6;
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
type CommunityMediaMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "video/mp4"
  | "video/webm"
  | "video/quicktime";

type UploadedMedia = {
  ticket_id: string;
  public_id: string;
  version: number;
  signature: string;
  resource_type: "image" | "video";
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
};

type CloudinaryUpload = UploadedMedia & {
  error?: { message?: string };
};

export function CommunityPostComposer() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getOnboardingState);
  const issueUpload = useServerFn(issueCommunityPostUpload);
  const createPost = useServerFn(createCommunityPost);
  const account = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? null],
    queryFn: () => fetchAccount(),
    enabled: Boolean(user),
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const incoming = Array.from(selected);
    const invalid = incoming.find((file) => !ACCEPTED_TYPES.has(file.type));
    if (invalid) {
      setError("Choose JPG, PNG, WebP, GIF, MP4, WebM, or MOV files.");
      return;
    }
    const combined = [...files, ...incoming];
    if (combined.length > MAX_MEDIA) {
      setError("A post can include up to six photos or videos.");
      return;
    }
    const tooLarge = incoming.find((file) =>
      file.type.startsWith("video/") ? file.size > 50 * 1024 * 1024 : file.size > 15 * 1024 * 1024,
    );
    if (tooLarge) {
      setError(
        tooLarge.type.startsWith("video/")
          ? "Videos must be under 50 MB."
          : "Images must be under 15 MB.",
      );
      return;
    }
    setError("");
    setFiles(combined);
  }

  async function upload(file: File): Promise<UploadedMedia> {
    const ticket = await issueUpload({
      data: { size: file.size, mimeType: file.type as CommunityMediaMimeType },
    });
    const form = new FormData();
    form.set("api_key", ticket.apiKey);
    form.set("timestamp", String(ticket.timestamp));
    form.set("public_id", ticket.publicId);
    form.set("overwrite", "false");
    form.set("signature", ticket.signature);
    form.set("file", file);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(ticket.cloudName)}/${ticket.resourceType}/upload`,
      { method: "POST", body: form },
    );
    const result = (await response.json().catch(() => ({}))) as CloudinaryUpload;
    if (!response.ok)
      throw new Error(result.error?.message ?? "A photo or video could not upload.");
    if (
      result.public_id !== ticket.publicId ||
      result.resource_type !== ticket.resourceType ||
      !Number.isInteger(result.version) ||
      typeof result.signature !== "string" ||
      result.bytes !== file.size
    ) {
      throw new Error("The uploaded media could not be verified. Please try again.");
    }
    return { ...result, ticket_id: ticket.ticketId };
  }

  async function publish() {
    setSubmitting(true);
    setError("");
    try {
      const media = await Promise.all(files.map(upload));
      const result = await createPost({ data: { body, media } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["story-pages"] }),
        queryClient.invalidateQueries({ queryKey: ["stories"] }),
        queryClient.invalidateQueries({ queryKey: ["story", result.id] }),
      ]);
      toast.success("Update published");
      await navigate({ to: "/stories/$id", params: { id: result.id } });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not publish the update.";
      setError(message);
      toast.error("Could not publish update", { description: message });
    } finally {
      setSubmitting(false);
    }
  }

  const canPublish = account.data?.accountType === "official" && account.data.username === "candid";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 md:py-10">
      <Button variant="ghost" className="mb-6 -ml-3" onClick={() => void navigate({ to: "/" })}>
        <ArrowLeft className="size-4" /> Back to feed
      </Button>
      <div className="border-b border-border/70 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Candid community
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Share an update
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          News, announcements and moments from Candid.
        </p>
      </div>

      {!user ? (
        <p className="py-8 text-sm text-muted-foreground">Sign in to continue.</p>
      ) : account.isPending ? (
        <p className="py-8 text-sm text-muted-foreground">Checking account…</p>
      ) : !canPublish ? (
        <p className="py-8 text-sm text-muted-foreground">
          Community updates can only be published from the official Candid account.
        </p>
      ) : (
        <section className="py-6">
          <div className="flex items-center gap-3">
            <ProfileAvatar initials="C" photoUrl={null} className="size-11" />
            <div>
              <p className="font-semibold">
                Candid <span className="text-primary">✓</span>
              </p>
              <p className="text-xs text-muted-foreground">Official community update</p>
            </div>
          </div>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
            rows={7}
            placeholder="What would you like the community to know?"
            className="mt-5 min-h-40 resize-y border-0 bg-transparent px-0 text-base leading-relaxed shadow-none focus-visible:ring-0"
          />
          <div className="flex justify-end text-xs text-muted-foreground">
            {body.length.toLocaleString()} / 5,000
          </div>

          {files.length ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="group relative overflow-hidden rounded-xl bg-secondary"
                >
                  {file.type.startsWith("video/") ? (
                    <video
                      src={previewUrls[index]}
                      controls
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <img
                      src={previewUrls[index]}
                      alt="Post attachment preview"
                      className="aspect-square w-full object-cover"
                    />
                  )}
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    onClick={() =>
                      setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                    className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 shadow"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border/70 pt-4">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              multiple
              className="sr-only"
              onChange={(event) => {
                addFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInput.current?.click()}
              disabled={submitting || files.length >= MAX_MEDIA}
            >
              <ImagePlus className="size-4" /> Add photo or video
            </Button>
            <span className="text-xs text-muted-foreground">
              Up to 6 files · images 15 MB · videos 50 MB
            </span>
            <Button
              className="ml-auto"
              disabled={submitting || (!body.trim() && files.length === 0)}
              onClick={() => void publish()}
            >
              {submitting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {submitting ? "Publishing…" : "Publish update"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </section>
      )}
    </main>
  );
}
