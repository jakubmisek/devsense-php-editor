/**
 * Entry point for devsense-php-editor-sampleweb.
 *
 * Bootstraps theme, top bar, editor content area with Monaco Editor.
 * Monaco Editor is imported from 'monaco-editor' (transitive dependency
 * through devsense-php-editor in the monorepo workspace, hoisted to root
 * node_modules and resolved by Vite).
 *
 * Uses PhpEditorUI to wire Monaco editor with WebSocket RPC to the
 * devsense-php-ls language server via the PhpEditor server.
 */
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { ThemeManager } from './theme';
import { PhpEditorUI } from './editor';

const WS_URL = (window as any).PHP_EDITOR_WS_URL || 'ws://127.0.0.1:8765';

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
  const override = (window as any).PHP_EDITOR_WS_URL;
  if (override) return override as string;

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

// Get the actual monaco object (handle .default for ESM/CJS interop)
const monacoObj = (monaco as any).default ?? monaco;

// Expose monaco globally so providers.browser.js can access SymbolKind, Range, Position, etc.
// monaco-editor ESM exports namespaced under editor/ and languages/, so we flatten them.
(window as any).monaco = {
  ...monacoObj,
  editor: monacoObj.editor,
  languages: monacoObj.languages,
  // Flatten commonly used enums/classes to top level for providers.browser.js
  Position: monacoObj.Position,
  Range: monacoObj.Range,
  Selection: monacoObj.Selection,
  SymbolKind: monacoObj.languages.SymbolKind,
  SymbolTag: monacoObj.languages.SymbolTag,
  InlayHintKind: monacoObj.languages.InlayHintKind,
  CompletionItemKind: monacoObj.languages.CompletionItemKind,
  DocumentHighlightKind: monacoObj.languages.DocumentHighlightKind,
  SignatureHelpTriggerKind: monacoObj.languages.SignatureHelpTriggerKind,
  CompletionTriggerKind: monacoObj.languages.CompletionTriggerKind,
  InlineCompletionTriggerKind: monacoObj.languages.InlineCompletionTriggerKind,
  MarkerSeverity: monacoObj.editor.MarkerSeverity,
  EndOfLineSequence: monacoObj.editor.EndOfLineSequence,
  EndOfLinePreference: monacoObj.editor.EndOfLinePreference,
  ScrollbarVisibility: monacoObj.editor.ScrollbarVisibility,
};

// Configure Monaco Editor web worker paths before any editor creation
// Monaco web workers bundled by Vite as ES module workers (`?worker`).
// PHP only needs the generic editor worker (LSP features come from devsense-php-ls).
(window as any).MonacoEnvironment = {
  getWorker: (_moduleId: string, _label: string) => new EditorWorker(),
};

async function main(): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="app-shell">
      <header class="top-bar">
        <div class="title">DEVSENSE PHP Editor Playground</div>
        <div class="theme-switcher">
          <label>Theme:</label>
          <select id="theme-select">
            <option value="automatic">Automatic</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </header>
      <main class="content">
        <div id="editor-container"></div>
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
    .theme-switcher { display: flex; align-items: center; gap: 8px; color: var(--theme-fg); }
    .theme-switcher label { font-size: 12px; color: var(--theme-text-muted); }
    .theme-switcher select {
      background: var(--theme-bg);
      color: var(--theme-fg);
      border: 1px solid var(--theme-border);
      padding: 4px 8px;
      font-size: 12px;
      border-radius: 4px;
      cursor: pointer;
    }

    .content { flex: 1; overflow: hidden; position: relative; }
    #editor-container { width: 100%; height: 100%; }
  `;
  document.head.appendChild(style);

  console.log('[main] Monaco Editor module loaded');

  // Resolve the WS URL (port file -> meta tag -> default). Async but non-blocking;
  // the editor connects without waiting for WS, so this resolves before PhpEditorUI uses it.
  const wsUrl = await resolveWsUrl();

  console.log('[main] Using WS URL:', wsUrl);

  console.log('[main] Monaco editor object keys:', Object.keys(monacoObj).filter(k => k.startsWith('editor') || k.startsWith('languages')).join(', '));

  const editorUI = new PhpEditorUI({
    wsUrl: wsUrl,
    containerId: 'editor-container',
    initialContent: '<?php\n\nfunction foo($x) {\n  echo strlen($x);\n}\n',
    monaco: monacoObj,
  });

  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  const theme = new ThemeManager(document.documentElement);
  themeSelect.value = theme.getTheme();
  themeSelect.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value as 'light' | 'dark' | 'automatic';
    theme.setTheme(val);
    const m = (monaco as any).default ?? monaco;
    const monacoTheme = val === 'dark' ? 'vs-dark' : val === 'light' ? 'vs' : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs');
    m.editor.setTheme(monacoTheme);
  });

  console.log('[main] Application initialized');
}

main().catch((err) => {
  console.error('[main] Failed to start editor:', err);
  const app = document.getElementById('app')!;
  app.innerHTML = `<div style="padding:20px;color:red">Failed to load editor: ${(err as Error).message}</div>`;
});
