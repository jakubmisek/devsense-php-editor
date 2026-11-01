/**
 * Entry point for devsense-php-editor-sampleweb.
 *
 * Bootstraps theme, top bar, editor content area with Monaco Editor.
 * Monaco Editor is imported directly from 'monaco-editor' (available
 * transitively through devsense-php-editor in the monorepo workspace).
 *
 * Uses PhpEditorUI to wire Monaco editor with WebSocket RPC to the
 * devsense-php-ls language server via the PhpEditor server.
 */
import * as monaco from 'monaco-editor';
import { ThemeManager } from './theme';
import { PhpEditorUI } from './editor';

const WS_URL = (window as any).PHP_EDITOR_WS_URL || 'ws://127.0.0.1:8765';

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

  // Initialize PhpEditorUI with WebSocket connection to PhpEditor server.
  const editorUI = new PhpEditorUI({
    wsUrl: WS_URL,
    containerId: 'editor-container',
    initialContent: '<?php\n\nfunction foo($x) {\n  echo strlen($x);\n}\n',
    monaco: (monaco as any).default ?? monaco,
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
