// Dependency-free: still renders when app bundles, hydration or SSR fail.
export function recoveryMarkup(startup = false): string {
  return `<style>
    .load-fallback { --recovery-bg: oklch(0.16 0.014 250); --recovery-fg: oklch(0.94 0.008 240); --recovery-muted: oklch(0.66 0.017 250); --recovery-primary: oklch(0.74 0.125 188); --recovery-border: oklch(0.3 0.018 252); position: fixed; inset: 0; z-index: 9999; overflow: auto; display: grid; align-items: center; justify-items: center; box-sizing: border-box; padding: 24px; background: var(--recovery-bg); color: var(--recovery-fg); font: 15px/1.5 system-ui, sans-serif; }
    .load-fallback section { width: 100%; max-width: 28rem; }
    .load-fallback h1 { font-size: 24px; line-height: 1.3; margin: 24px 0 12px; }
    .load-fallback p { color: var(--recovery-muted); }
    .load-fallback strong { color: var(--recovery-primary); font-size: 18px; }
    .load-fallback .session { padding: 16px 0; margin: 24px 0; border-block: 1px solid var(--recovery-border); }
    .load-fallback .actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .load-fallback a { padding: 8px 16px; border-radius: 6px; font: inherit; text-decoration: none; border: 1px solid var(--recovery-border); color: var(--recovery-fg); }
    .load-fallback a:first-child { background: var(--recovery-primary); color: var(--recovery-bg); }
    .load-fallback a:focus-visible { outline: 2px solid var(--recovery-primary); outline-offset: 4px; }
    #startup-recovery[hidden] { display: none; }
  </style>
  <main class="load-fallback" aria-label="App recovery"><section>
    <strong>Clever Trade Shield</strong>
    <h1>${startup ? "Opening your terminal…" : "Your terminal couldn’t load"}</h1>
    <p>${startup ? "If this page does not open, retry or go to sign-in." : "The connection may be interrupted. Retry this page or open sign-in. Live orders remain disabled."}</p>
    <div class="session">Sign-in status<br>Unable to verify sign-in · your session has not been cleared</div>
    <div class="actions"><a href="" role="button">Retry</a><a href="/login">Open sign-in</a></div>
  </section></main>`;
}

export function renderErrorPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Recovery — Clever Trade Shield</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body>${recoveryMarkup()}</body></html>`;
}
