/**
 * DEVSENSE PHP Editor Playground — demo page.
 *
 * Only UI lives here (layout, theme switcher, diagnostics panel, sample code).
 * The editor itself (Monaco, WebSocket, LSP handshake, providers, diagnostics
 * markers) is the `createPhpEditor` component from `devsense-php-editor/browser`.
 */
import { createPhpEditor, type PhpEditorTheme } from 'devsense-php-editor/browser';
import { ThemeManager } from './theme';
import { DiagnosticsPanel } from './diagnostics';
import { createThemeSwitch, THEME_SWITCH_CSS } from './theme-switch';
import './types';

const SAMPLE_CODE = '<?php\n\nfunction foo($x) {\n  echo strlen($x);\n}\n';

const WS_URL = window.PHP_EDITOR_WS_URL || 'ws://127.0.0.1:8765';

/** Resolve the WebSocket URL to the PhpEditor server.
 *
 * PhpEditor writes its bound WS port to `public/php-editor-port`, which Vite
 * serves at `http://localhost:5173/php-editor-port`. Fetching it lets the
 * client connect to whatever port PhpEditor actually bound (Playwright picks
 * an ephemeral port when none is configured), so LSP-backed tests run against
 * a live backend.
 *
 * Fallback chain:
 *   1. window.PHP_EDITOR_WS_URL (manual override)
 *   2. /php-editor-port port file served by Vite
 *   3. meta[name="php-editor-ws-url"] content
 *   4. hardcoded default ws://127.0.0.1:8765
 */
async function resolveWsUrl(): Promise<string> {
  const override = window.PHP_EDITOR_WS_URL;
  if (override) return override;

  // Try the port file served by Vite (public/php-editor-port).
  try {
    const res = await fetch('/php-editor-port', { cache: 'no-store' });
    if (res.ok) {
      const port = (await res.text()).trim();
      if (port && /^\d+$/.test(port)) {
        return `ws://127.0.0.1:${port}`;
      }
    }
  } catch {
    // ignore — fall through to meta tag / default
  }

  // Meta tag set by the server (if any).
  const wsUrlFromMeta = document.querySelector('meta[name="php-editor-ws-url"]')?.getAttribute('content');
  if (wsUrlFromMeta) return wsUrlFromMeta;

  return WS_URL;
}

async function main(): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="app-shell">
      <header class="top-bar">
        <div class="title">DEVSENSE PHP Editor Playground</div>
        <div id="theme-switch-slot"></div>
      </header>
      <main class="content">
        <div id="editor-container"></div>
        <div id="server-message" class="server-message" role="status" hidden></div>
      </main>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #app { height: 100%; width: 100%; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }

    .app-shell { display: flex; flex-direction: column; height: 100vh; width: 100vw; }

    .top-bar {
      height: 44px;
      background: var(--theme-surface);
      border-bottom: 1px solid var(--theme-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      font-size: 16px;
      font-weight: 600;
      color: var(--theme-fg);
    }
    .top-bar .title { flex: 1; }

    .content { flex: 1; overflow: hidden; position: relative; }
    #editor-container { width: 100%; height: 100%; }
    .server-message {
      position: absolute; top: 12px; right: 16px; max-width: 420px; z-index: 50;
      padding: 8px 12px; border-radius: 6px; font-size: 13px;
      background: var(--theme-surface); color: var(--theme-fg); border: 1px solid var(--theme-border);
      box-shadow: 0 2px 8px rgba(0,0,0,.2);
    }
  `;
  style.textContent += THEME_SWITCH_CSS;
  document.head.appendChild(style);

  const wsUrl = await resolveWsUrl();
  console.log('[main] Using WS URL:', wsUrl);

  const theme = new ThemeManager(document.documentElement);
  const toEditorTheme = (t: 'light' | 'dark' | 'automatic'): PhpEditorTheme => (t === 'automatic' ? 'auto' : t);

  DiagnosticsPanel.injectStyles();
  const diagnostics = new DiagnosticsPanel();

  // Optional `?doc=Name.php` sets the document file name (the LS derives e.g. the suggested class name from it).
  const docParam = new URLSearchParams(location.search).get('doc');
  const documentName = docParam && /^[A-Za-z0-9_-]+\.php$/.test(docParam) ? docParam : undefined;

  const phpEditor = createPhpEditor(document.getElementById('editor-container')!, {
    serverUrl: wsUrl,
    documentName,
    initialCode: SAMPLE_CODE,
    theme: toEditorTheme(theme.getTheme()),
  });
  phpEditor.onDiagnostics((list) => diagnostics.setDiagnostics(phpEditor.getDocumentUri(), list));
  // Messages from the language server (e.g. the notice shown by a "(PREMIUM)" code action without a licence).
  const toast = document.getElementById('server-message')!;
  let toastTimer: number | undefined;
  phpEditor.onServerMessage((m) => {
    console.log('[LS]', m.type, m.message);
    toast.textContent = m.message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 6000);
  });
  phpEditor.ready.catch((err: Error) => console.warn('[main] Language server unavailable (editing still works):', err.message));

  // Test hooks for Playwright.
  window.phpEditor = phpEditor;
  window.monaco = phpEditor.monaco;

  document.getElementById('theme-switch-slot')!.replaceWith(createThemeSwitch(theme.getTheme(), (val) => {
    theme.setTheme(val);
    phpEditor.setTheme(toEditorTheme(val));
  }));

  console.log('[main] Application initialized');
}

main().catch((err) => {
  console.error('[main] Failed to start editor:', err);
  const app = document.getElementById('app')!;
  app.innerHTML = `<div style="padding:20px;color:red">Failed to load editor: ${(err as Error).message}</div>`;
});
