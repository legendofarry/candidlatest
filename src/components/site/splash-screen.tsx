import { useEffect, useState } from "react";
import { Flame } from "lucide-react";

/**
 * Full-screen splash shown while the app boots (initial load / refresh).
 */
export function SplashScreen() {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const start = window.setTimeout(() => setLeaving(true), 900);
    const end = window.setTimeout(() => setGone(true), 1600);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden
      className={`splash-screen ${leaving ? "splash-screen-leaving" : ""}`}
      role="presentation"
    >
      <div className="splash-aura" />
      <div className="splash-mark">
        <span className="splash-ring splash-ring-a" />
        <span className="splash-ring splash-ring-b" />
        <Flame className="splash-flame size-9 text-primary" />
      </div>
      <div className="splash-wordmark font-display">Candid</div>
      <div className="splash-bar">
        <span />
      </div>
    </div>
  );
}
