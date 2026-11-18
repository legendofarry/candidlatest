export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load | Candid</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#090b0d" />
    <style>
      :root {
        color-scheme: dark;
        font-family: "Figtree", "Segoe UI", sans-serif;
        background: #090b0d;
        color: #f5f7f5;
        font-synthesis: none;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      * { box-sizing: border-box; }

      body {
        min-width: 320px;
        min-height: 100vh;
        min-height: 100svh;
        margin: 0;
        overflow-x: hidden;
        background:
          radial-gradient(ellipse at 76% 48%, rgba(32, 90, 75, 0.19), transparent 34rem),
          radial-gradient(ellipse at 8% 100%, rgba(88, 66, 131, 0.12), transparent 30rem),
          #090b0d;
      }

      body::before {
        position: fixed;
        z-index: 0;
        inset: 0;
        background-image: linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
        background-size: 64px 64px;
        content: "";
        mask-image: linear-gradient(to bottom, black, transparent 88%);
        pointer-events: none;
      }

      a { color: inherit; }

      .page {
        position: relative;
        z-index: 1;
        display: flex;
        min-height: 100vh;
        min-height: 100svh;
        flex-direction: column;
        padding: 0 clamp(1.25rem, 6vw, 6rem);
      }

      .topbar, .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .topbar {
        min-height: 88px;
        border-bottom: 1px solid rgba(255,255,255,.09);
        animation: enter .7s .05s both;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: .7rem;
        color: #f6f7f4;
        font-size: 1.08rem;
        font-weight: 750;
        letter-spacing: -.045em;
        text-decoration: none;
      }

      .brand-mark {
        display: grid;
        width: 31px;
        height: 31px;
        place-items: center;
        border-radius: 10px;
        background: #c4f36a;
        color: #10150b;
      }

      .brand-mark svg { width: 19px; height: 19px; }

      .top-note, .footer {
        color: #929a98;
        font-size: .79rem;
        letter-spacing: .015em;
      }

      .top-note {
        display: inline-flex;
        align-items: center;
        gap: .55rem;
      }

      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #c4f36a;
        box-shadow: 0 0 14px rgba(196,243,106,.55);
      }

      main {
        display: grid;
        width: min(100%, 1160px);
        flex: 1;
        grid-template-columns: minmax(0, 1fr) minmax(300px, .92fr);
        align-items: center;
        gap: clamp(2rem, 7vw, 7rem);
        margin: 0 auto;
        padding: clamp(3rem, 8vh, 7rem) 0;
      }

      .copy {
        position: relative;
        z-index: 2;
        max-width: 550px;
        animation: enter .8s .12s both;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: .6rem;
        margin: 0 0 1.6rem;
        color: #c4f36a;
        font-size: .72rem;
        font-weight: 700;
        letter-spacing: .14em;
        text-transform: uppercase;
      }

      h1 {
        max-width: 10ch;
        margin: 0;
        color: #f6f7f4;
        font-size: clamp(3.35rem, 7.3vw, 6.35rem);
        font-weight: 650;
        letter-spacing: -.075em;
        line-height: .98;
      }

      .description {
        max-width: 410px;
        margin: 1.6rem 0 0;
        color: #a7afad;
        font-size: clamp(1rem, 1.5vw, 1.13rem);
        line-height: 1.75;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: .8rem;
        margin-top: 2.2rem;
      }

      .button {
        display: inline-flex;
        min-height: 52px;
        align-items: center;
        justify-content: center;
        gap: .65rem;
        padding: 0 1.25rem;
        border: 1px solid transparent;
        border-radius: 14px;
        cursor: pointer;
        font: inherit;
        font-size: .92rem;
        font-weight: 700;
        text-decoration: none;
        transition: transform .2s ease, background-color .2s ease, border-color .2s ease, box-shadow .2s ease;
      }

      .button:hover { transform: translateY(-2px); }
      .button:active { transform: translateY(0) scale(.98); }
      .button:focus-visible { outline: 3px solid rgba(196,243,106,.7); outline-offset: 4px; }
      .button svg { width: 17px; height: 17px; }

      .button-primary {
        background: #c4f36a;
        color: #11170a;
        box-shadow: 0 8px 28px rgba(168,219,83,.13);
      }

      .button-primary:hover {
        background: #d3fb88;
        box-shadow: 0 11px 32px rgba(168,219,83,.22);
      }

      .button-secondary {
        border-color: rgba(255,255,255,.14);
        background: rgba(255,255,255,.035);
        color: #edf0ed;
      }

      .button-secondary:hover {
        border-color: rgba(255,255,255,.25);
        background: rgba(255,255,255,.075);
      }

      .art {
        position: relative;
        display: grid;
        min-height: 410px;
        place-items: center;
        isolation: isolate;
        animation: enter .9s .22s both;
      }

      .orb-glow {
        position: absolute;
        z-index: -1;
        width: min(80%, 390px);
        aspect-ratio: 1;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(140,224,153,.22), rgba(96,182,148,.08) 42%, transparent 70%);
        filter: blur(5px);
        animation: breathe 5s ease-in-out infinite;
      }

      .orbit {
        position: absolute;
        width: min(86%, 410px);
        aspect-ratio: 1;
        border: 1px solid rgba(209,235,215,.12);
        border-radius: 50%;
      }

      .orbit::before, .orbit::after {
        position: absolute;
        border: 1px solid rgba(209,235,215,.11);
        border-radius: 50%;
        content: "";
      }

      .orbit::before { inset: 11%; }
      .orbit::after { inset: 23%; }

      .orbit-outer { animation: orbit 32s linear infinite; }
      .orbit-inner { width: min(62%, 296px); border-style: dashed; animation: orbit-reverse 38s linear infinite; }

      .orbit-dot {
        position: absolute;
        top: 16%;
        right: 13%;
        width: 11px;
        height: 11px;
        border: 3px solid #101515;
        border-radius: 50%;
        background: #c4f36a;
        box-shadow: 0 0 24px rgba(196,243,106,.8);
      }

      .signal {
        position: relative;
        display: grid;
        width: clamp(138px, 18vw, 190px);
        aspect-ratio: 1;
        place-items: center;
        border: 1px solid rgba(255,255,255,.2);
        border-radius: 42px;
        background: linear-gradient(145deg, rgba(255,255,255,.14), rgba(255,255,255,.035));
        box-shadow: 0 30px 100px rgba(0,0,0,.32), inset 0 1px rgba(255,255,255,.15);
        backdrop-filter: blur(16px);
        transform: rotate(-8deg);
        animation: float 6s ease-in-out infinite;
      }

      .signal::before {
        position: absolute;
        inset: 10px;
        border: 1px solid rgba(255,255,255,.06);
        border-radius: 34px;
        content: "";
      }

      .signal svg {
        width: 68px;
        height: 68px;
        color: #d5f79a;
        filter: drop-shadow(0 0 20px rgba(196,243,106,.24));
      }

      .orbit-label {
        position: absolute;
        right: 1%;
        bottom: 13%;
        display: flex;
        align-items: center;
        gap: .6rem;
        padding: .7rem .9rem;
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 999px;
        background: rgba(18,22,22,.72);
        color: #c9cfcb;
        font-size: .72rem;
        letter-spacing: .04em;
        backdrop-filter: blur(12px);
        box-shadow: 0 12px 32px rgba(0,0,0,.22);
      }

      .footer {
        min-height: 72px;
        border-top: 1px solid rgba(255,255,255,.09);
      }

      .footer a {
        color: #aab2af;
        text-decoration: none;
        transition: color .2s ease;
      }

      .footer a:hover { color: #c4f36a; }

      @keyframes enter {
        from { opacity: 0; transform: translateY(18px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes float {
        0%, 100% { transform: translateY(0) rotate(-8deg); }
        50% { transform: translateY(-12px) rotate(-5deg); }
      }

      @keyframes breathe {
        0%, 100% { opacity: .7; transform: scale(.92); }
        50% { opacity: 1; transform: scale(1.06); }
      }

      @keyframes orbit { to { transform: rotate(360deg); } }
      @keyframes orbit-reverse { to { transform: rotate(-360deg); } }

      @media (max-width: 760px) {
        .page { padding: 0 1.25rem; }
        .topbar { min-height: 72px; }
        main {
          grid-template-columns: 1fr;
          gap: 1rem;
          padding: clamp(3.5rem, 9vh, 5rem) 0 2rem;
        }
        .copy { max-width: 540px; margin: 0 auto; }
        h1 { font-size: clamp(3.2rem, 12vw, 5rem); }
        .art { min-height: 270px; }
        .orb-glow { width: 260px; }
        .orbit { width: 270px; }
        .orbit-inner { width: 200px; }
        .signal { width: 130px; border-radius: 32px; }
        .signal::before { border-radius: 25px; }
        .signal svg { width: 55px; height: 55px; }
        .orbit-label { right: max(0px, calc(50% - 180px)); bottom: 1%; }
      }

      @media (max-width: 420px) {
        .top-note { font-size: .68rem; }
        .actions { flex-direction: column; }
        .button { width: 100%; }
        .footer { font-size: .7rem; }
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: .01ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-duration: .01ms !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="topbar">
        <a class="brand" href="/" aria-label="Candid home">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M19.2 7.4a8 8 0 1 0 0 9.2M19.2 7.4V3.8m0 3.6h-3.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          candid
        </a>
        <div class="top-note"><span class="status-dot" aria-hidden="true"></span> A little pause in the signal</div>
      </header>

      <main>
        <section class="copy" aria-labelledby="page-title">
          <p class="eyebrow"><span class="status-dot" aria-hidden="true"></span> Temporary interruption</p>
          <h1 id="page-title">This page didn’t load.</h1>
          <p class="description">Something went wrong while we were getting this page ready. Give it another try, or head back to Candid.</p>
          <div class="actions">
            <button class="button button-primary" type="button" onclick="location.reload()">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 7v5h-5M4.9 9a7.5 7.5 0 0 1 12.5-2L20 12M4 17v-5h5m10.1 3a7.5 7.5 0 0 1-12.5 2L4 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Try again
            </button>
            <a class="button button-secondary" href="/">
              Go home
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
          </div>
        </section>

        <div class="art" aria-hidden="true">
          <div class="orb-glow"></div>
          <div class="orbit orbit-outer"><span class="orbit-dot"></span></div>
          <div class="orbit orbit-inner"></div>
          <div class="signal">
            <svg viewBox="0 0 64 64" fill="none">
              <path d="M9 24.5a35.5 35.5 0 0 1 46 0M17 33a23.5 23.5 0 0 1 30 0M25 41.5a11 11 0 0 1 14 0" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
              <circle cx="32" cy="51" r="3" fill="currentColor"/>
              <path d="M50 12 39 23" stroke="#f5f7f5" stroke-width="3" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="orbit-label"><span class="status-dot"></span> We’re on it</div>
        </div>
      </main>

      <footer class="footer">
        <span>Thanks for your patience.</span>
        <a href="/">Back to Candid <span aria-hidden="true">↗</span></a>
      </footer>
    </div>
  </body>
</html>`;
}
