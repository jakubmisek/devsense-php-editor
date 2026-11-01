/**
 * Entry point for devsense-php-editor-sampleweb.
 *
 * Bootstraps theme, top bar, editor content area with Monaco Editor.
 * Monaco Editor is loaded via AMD loader from /public/monaco-editor/ (see index.html)
 * and exposed globally as window.monaco.
 */
import { ThemeManager, CSS_VARIABLES } from './theme';

const WS_URL = (window as any).PHP_EDITOR_WS_URL || 'ws://127.0.0.1:0';

function buildUI(): void {
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
      <div id="diagnostics-panel"></div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #app { height: 100%; width: 100%; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }

    :root[data-theme='light'] { ${Object.entries(CSS_VARIABLES.light).map(([k, v]) => `${k}: ${v};`).join(' ')} }
    :root[data-theme='dark'] { ${Object.entries(CSS_VARIABLES.dark).map(([k, v]) => `${k}: ${v};`).join(' ')} }

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

  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  const theme = new ThemeManager(document.documentElement);
  themeSelect.value = theme.getTheme();
  themeSelect.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value as 'light' | 'dark' | 'automatic';
    theme.setTheme(val);
    const monacoTheme = val === 'dark' ? 'vs-dark' : val === 'light' ? 'vs' : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs');
    (window.monaco as any).editor.setTheme(monacoTheme);
  });

  return { theme };
}

async function main(): Promise<void> {
  const { theme } = buildUI();

  // Wait for Monaco Editor to be loaded globally via AMD loader (see index.html).
  const waitForMonaco = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      const check = () => {
        const m = (window as any).monaco;
        if (m && m.editor) {
          resolve(m);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
      setTimeout(() => reject(new Error('Monaco Editor failed to load from local files')), 30000);
    });
  };

  const monaco = await waitForMonaco();

  // Create the editor with sample PHP code
  const editor = monaco.editor.create(document.getElementById('editor-container'), {
    value: `<?php\n\nfunction foo(\$x) {\n  echo strlen(\$x);\n}\n`,
    language: 'php',
    theme: theme.getTheme() === 'dark' ? 'vs-dark' : 'vs',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
  });

  console.log('Monaco Editor created successfully with PHP code');
  console.log('Editor value length:', editor.getValue().length);

  (window as any).devsenseEditor = editor;
  (window as any).devsenseTheme = theme;

  window.addEventListener('beforeunload', () => {
    editor.dispose();
  });
}

main().catch((err) => {
  console.error('Failed to start editor:', err);
});
