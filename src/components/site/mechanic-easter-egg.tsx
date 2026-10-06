import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

type Phase = "vortex" | "void" | "chat" | "rebuild";
type Msg = { from: "a" | "b"; text: string };

const SCRIPT: { from: "a" | "b"; text: string; typing: number; pause: number }[] = [
  { from: "a", text: "Hey… you there? 👀", typing: 0, pause: 1800 },
  { from: "b", text: "I'm literally on leave. What happened?", typing: 1900, pause: 1400 },
  { from: "a", text: "Someone double-tapped the logo. The whole app got sucked into a black hole.", typing: 2300, pause: 1500 },
  { from: "b", text: "Again?? 😮‍💨", typing: 1100, pause: 1300 },
  { from: "b", text: "Fine. Grabbing my spanner. Rebuilding it pixel by pixel 🔧", typing: 2000, pause: 1600 },
  { from: "a", text: "Enjoy the beach for both of us 🏖️", typing: 1400, pause: 1500 },
];

type P = {
  x: number; y: number; ox: number; oy: number;
  r: number; a: number; r0: number; a0: number;
  delay: number; size: number; color: string; done: boolean;
};

function collectParticles(w: number, h: number): P[] {
  const cx = w / 2, cy = h / 2;
  const out: P[] = [];
  const push = (x: number, y: number, color: string, size: number) => {
    const dx = x - cx, dy = y - cy;
    const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    out.push({ x, y, ox: x, oy: y, r, a, r0: r, a0: a, delay: 0, size, color, done: false });
  };
  const bg = getComputedStyle(document.body).backgroundColor || "rgb(15,15,20)";
  // background dust grid
  for (let y = 0; y < h; y += 14) for (let x = 0; x < w; x += 14) push(x + Math.random() * 10, y + Math.random() * 10, bg, 2 + Math.random() * 2);
  // content dust from visible elements
  const els = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,p,a,button,img,svg,li,[class*='rounded']"));
  let budget = 2600;
  for (const el of els) {
    if (budget <= 0) break;
    if (el.closest("[data-egg-root]")) continue;
    const rc = el.getBoundingClientRect();
    if (rc.width < 4 || rc.height < 4 || rc.bottom < 0 || rc.top > h || rc.right < 0 || rc.left > w) continue;
    const cs = getComputedStyle(el);
    const bgc = cs.backgroundColor;
    const isText = /^(H\d|P|A|LI|BUTTON)$/.test(el.tagName);
    const color = isText ? cs.color : bgc && !bgc.includes("rgba(0, 0, 0, 0)") ? bgc : cs.color;
    const n = Math.min(90, Math.max(4, Math.floor((rc.width * rc.height) / 900)));
    for (let i = 0; i < n && budget > 0; i++, budget--) {
      push(rc.left + Math.random() * rc.width, rc.top + Math.random() * rc.height, color, 1 + Math.random() * 2.2);
    }
  }
  const maxR = Math.hypot(cx, cy);
  for (const p of out) p.delay = (1 - p.r / maxR) * 0.15 + (p.r / maxR) * 0.55 * Math.random() + Math.random() * 0.25;
  return out;
}

export function MechanicEasterEgg({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("vortex");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState<"a" | "b" | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<P[]>([]);
  const phaseRef = useRef<Phase>("vortex");
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const siblings = Array.from(document.body.children).filter(
      (n): n is HTMLElement => n instanceof HTMLElement && !n.hasAttribute("data-egg-root") && n.tagName !== "SCRIPT",
    );
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const setPage = (css: Partial<CSSStyleDeclaration>, ms: number, ease = "cubic-bezier(.7,0,.3,1)") =>
      siblings.forEach((el) => {
        el.style.transition = `transform ${ms}ms ${ease}, filter ${ms}ms ${ease}, opacity ${ms}ms ${ease}`;
        el.style.transformOrigin = `50% ${window.scrollY + window.innerHeight / 2}px`;
        Object.assign(el.style, css);
      });
    const resetPage = () =>
      siblings.forEach((el) => {
        el.style.transition = el.style.transform = el.style.filter = el.style.opacity = el.style.transformOrigin = "";
      });

    setMsgs([]); setTyping(null);
    const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };
    go("vortex");

    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    particles.current = reduce ? [] : collectParticles(w, h);
    const canvas = canvasRef.current!;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const cx = w / 2, cy = h / 2;

    // page itself dissolves & twists away while dust peels off
    requestAnimationFrame(() => setPage({ transform: "rotate(220deg) scale(0.02)", filter: "blur(14px) brightness(1.6)", opacity: "0" }, reduce ? 50 : 2600));

    let start = performance.now();
    let raf = 0;
    let darkness = 0;
    let rebuildStart = 0;
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const ph = phaseRef.current;
      ctx.clearRect(0, 0, w, h);
      if (ph === "vortex") darkness = Math.min(1, t / 2.4);
      if (ph === "rebuild") darkness = Math.max(0, 1 - (now - rebuildStart) / 1600);
      ctx.fillStyle = `rgba(0,0,0,${darkness})`;
      ctx.fillRect(0, 0, w, h);

      if (ph === "vortex") {
        // accretion glow
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90 + t * 30);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(0.35, "rgba(0,0,0,1)");
        g.addColorStop(0.5, `rgba(180,140,255,${0.35 * Math.min(1, t)})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, 90 + t * 30, 0, Math.PI * 2); ctx.fill();
        for (const p of particles.current) {
          if (p.done) continue;
          const lt = t - p.delay;
          if (lt < 0) { ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); continue; }
          const pull = 0.012 + lt * lt * 0.05;
          p.r = Math.max(0, p.r - (p.r * pull + lt * 2.2));
          p.a += 0.02 + 2.4 / (p.r + 25) + lt * 0.015;
          const px = cx + Math.cos(p.a) * p.r, py = cy + Math.sin(p.a) * p.r * 0.92;
          const s = p.size * Math.min(1, p.r / 120 + 0.25);
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = Math.min(1, p.r / 40);
          ctx.lineWidth = s;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(px, py); ctx.stroke();
          ctx.globalAlpha = 1;
          p.x = px; p.y = py;
          if (p.r < 3) p.done = true;
        }
      } else if (ph === "rebuild") {
        const lt = (now - rebuildStart) / 1000;
        for (const p of particles.current) {
          const k = Math.min(1, Math.max(0, (lt - p.delay * 0.4) / 1.1));
          const e = 1 - Math.pow(1 - k, 3);
          const r = p.r0 * e, a = p.a0 - (1 - e) * 6;
          const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
          ctx.globalAlpha = k < 1 ? 1 : Math.max(0, 1 - (lt - 1.4) * 2);
          ctx.fillStyle = p.color;
          ctx.fillRect(px, py, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        // shockwave ring
        const ring = lt * 900;
        ctx.strokeStyle = `rgba(200,170,255,${Math.max(0, 0.6 - lt * 0.5)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, ring, 0, Math.PI * 2); ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // timeline
    const vortexEnd = reduce ? 200 : 3000;
    at(vortexEnd, () => go("void"));
    let tl = vortexEnd + (reduce ? 200 : 1900); // dramatic silence
    at(tl, () => go("chat"));
    SCRIPT.forEach((s) => {
      if (s.typing) { at(tl, () => setTyping(s.from)); tl += reduce ? 100 : s.typing; }
      at(tl, () => { setTyping(null); setMsgs((m) => [...m, { from: s.from, text: s.text }]); });
      tl += reduce ? 200 : s.pause;
    });
    at(tl, () => {
      go("rebuild");
      rebuildStart = performance.now();
      setPage({ transform: "rotate(0deg) scale(1)", filter: "blur(0px) brightness(1)", opacity: "1" }, reduce ? 50 : 1500, "cubic-bezier(.2,.8,.2,1)");
    });
    at(tl + (reduce ? 300 : 2300), () => closeRef.current());

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      resetPage();
      document.body.style.overflow = prevOverflow;
      start = 0;
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div data-egg-root role="dialog" aria-modal="true" aria-label="Candid mechanics" className="fixed inset-0 z-[300]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {(phase === "void" || phase === "chat") && (
        <div className="absolute inset-0 bg-black">
          <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background:repeating-linear-gradient(0deg,#fff_0_1px,transparent_1px_3px)]" />
        </div>
      )}
      <button
        type="button"
        aria-label="Skip"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex size-9 items-center justify-center rounded-full text-white/30 transition hover:bg-white/10 hover:text-white"
      >
        <X className="size-4" />
      </button>
      {phase === "chat" && (
        <div className="absolute inset-0 flex flex-col justify-end px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-20 font-sans text-[15px] sm:mx-auto sm:max-w-md">
          <div className="flex flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {msgs.map((m, i) => (
                <motion.div
                  key={i}
                  layout
                  initial={{ opacity: 0, y: 24, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  className={`max-w-[80%] rounded-[20px] px-4 py-2.5 leading-snug ${
                    m.from === "a"
                      ? "self-start rounded-bl-md bg-[#262629] text-white"
                      : "self-end rounded-br-md bg-[#0a84ff] text-white"
                  }`}
                >
                  {m.text}
                </motion.div>
              ))}
              {typing && (
                <motion.div
                  key="typing"
                  layout
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  className={`flex gap-1 rounded-[20px] px-4 py-3.5 ${typing === "a" ? "self-start bg-[#262629]" : "self-end bg-[#0a84ff]/80"}`}
                >
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="size-2 rounded-full bg-white/80"
                      animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
