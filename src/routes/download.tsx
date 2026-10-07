import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Check,
  Download,
  Flame,
  MonitorSmartphone,
  Smartphone,
  Sparkles,
} from "lucide-react";

/**
 * Public URL of the Android APK.
 * Upload the APK (Netlify public files or GitHub Releases) and paste its link here.
 * Leave empty until then — the page shows a "coming soon" state.
 */
const APK_URL = "";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download Candid — Android app & desktop install" },
      {
        name: "description",
        content:
          "Install Candid on your Android phone with the official APK, or add Candid to your desktop home screen. Workplace stories from Kenya.",
      },
      { property: "og:title", content: "Download Candid — Android app & desktop install" },
      {
        property: "og:description",
        content: "Take Candid everywhere: the Android app and one-tap desktop install.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DownloadPage,
});

const androidSteps = [
  "Tap the download button below to get the Candid APK file.",
  "If your phone asks, allow installs from your browser (Settings → Apps → Special access → Install unknown apps).",
  "Open the downloaded file and confirm Install, then sign in like usual.",
];

function DownloadPage() {
  return (
    <div className="min-h-screen w-full bg-[radial-gradient(circle_at_top_left,_rgba(134,239,172,0.16),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.16),_transparent_28%),hsl(var(--background))]">
      <div className="mx-auto w-full max-w-2xl px-5 py-8 md:py-14">
        <header className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Flame className="size-5 text-primary" />
            <span className="font-display text-lg font-semibold tracking-tight">Candid</span>
          </Link>
          <Link
            to="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Open Candid
          </Link>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mt-10 rounded-3xl border border-border bg-card/80 p-7 shadow-xl backdrop-blur md:mt-14 md:p-10"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="size-3.5" />
            Install Candid
          </div>
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Take Candid everywhere.
          </h1>
          <p className="mt-3 max-w-lg text-muted-foreground">
            The Candid app opens full-screen, feels faster, and sits on your home screen like any
            other app — same Candid account, nothing extra to learn.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="mt-5 rounded-3xl border border-border bg-card p-6 md:p-8"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15">
              <Smartphone className="size-5 text-primary" />
            </span>
            <div>
              <h2 className="font-display text-xl font-semibold">Android app (APK)</h2>
              <p className="text-sm text-muted-foreground">Direct download — no store needed.</p>
            </div>
          </div>

          {APK_URL ? (
            <a
              href={APK_URL}
              className="glow-primary mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground sm:w-auto sm:px-8"
            >
              <Download className="size-5" />
              Download the Candid app
            </a>
          ) : (
            <div className="mt-5">
              <span
                aria-disabled
                className="inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-border bg-secondary/60 text-base font-semibold text-muted-foreground sm:w-auto sm:px-8"
              >
                <Download className="size-5" />
                APK download — coming soon
              </span>
              <p className="mt-3 text-sm text-muted-foreground">
                The app file is being prepared. In the meantime you can add Candid to your home
                screen straight from the browser — it works just like an app.
              </p>
            </div>
          )}

          <ol className="mt-6 space-y-3">
            {androidSteps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          className="mt-5 rounded-3xl border border-border bg-card p-6 md:p-8"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-secondary">
              <MonitorSmartphone className="size-5 text-foreground" />
            </span>
            <div>
              <h2 className="font-display text-xl font-semibold">Add Candid to your home screen</h2>
              <p className="text-sm text-muted-foreground">Works on Android, iPhone and PC.</p>
            </div>
          </div>
          <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">Android (Chrome):</strong> open Candid, tap the
                ⋮ menu, then <em>Add to Home screen</em>.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">iPhone (Safari):</strong> tap the Share button,
                then <em>Add to Home Screen</em>.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">Windows PC (Chrome/Edge):</strong> open Candid,
                click the install icon in the address bar, then <em>Install</em>.
              </span>
            </li>
          </ul>
          <p className="mt-5 rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
            Candid for Google Play and the Microsoft Store is on the way — this page will be updated
            when they are live.
          </p>
        </motion.section>

        <p className="mt-8 pb-6 text-center text-xs text-muted-foreground">
          Stories are personal opinions shared by members. Employers have a right of reply.
        </p>
      </div>
    </div>
  );
}
