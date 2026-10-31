/**
 * Theme manager: light / dark / automatic.
 *
 * Reads/writes the user's preference to localStorage under key
 * 'devsense-php-editor-theme'. Automatic follows prefers-color-scheme.
 */
export class ThemeManager {
  private root: HTMLElement;
  private current: 'light' | 'dark' | 'automatic' = 'automatic';
  private media: MediaQueryList | null = null;

  constructor(root: HTMLElement = document.documentElement) {
    this.root = root;
    this.load();
    this.apply();
    this.watchSystem();
  }

  private load(): void {
    try {
      const stored = localStorage.getItem('devsense-php-editor-theme') as
        | 'light' | 'dark' | 'automatic'
        | null;
      if (stored) this.current = stored;
    } catch {
      // ignore
    }
  }

  save(): void {
    try {
      localStorage.setItem('devsense-php-editor-theme', this.current);
    } catch {
      // ignore
    }
  }

  getTheme(): 'light' | 'dark' | 'automatic' {
    return this.current;
  }

  setTheme(theme: 'light' | 'dark' | 'automatic'): void {
    this.current = theme;
    this.save();
    this.apply();
  }

  private apply(): void {
    let resolved: 'light' | 'dark';
    if (this.current === 'automatic') {
      resolved = this.media?.matches ?? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    } else {
      resolved = this.current;
    }
    this.root.setAttribute('data-theme', resolved);
    this.root.classList.remove('theme-light', 'theme-dark');
    this.root.classList.add(`theme-${resolved}`);
  }

  private watchSystem(): void {
    this.media = window.matchMedia('(prefers-color-scheme: dark)');
    this.media.addEventListener('change', () => {
      if (this.current === 'automatic') this.apply();
    });
  }
}

export const CSS_VARIABLES = {
  light: {
    '--theme-bg': '#ffffff',
    '--theme-fg': '#1e1e1e',
    '--theme-surface': '#f3f3f3',
    '--theme-border': '#cccccc',
    '--theme-accent': '#007acc',
    '--theme-text-muted': '#666666',
    '--theme-diagnostic-error-bg': '#fdecea',
    '--theme-diagnostic-error-border': '#c91c1c',
    '--theme-diagnostic-warning-bg': '#fffbeb',
    '--theme-diagnostic-warning-border': '#d97706',
  },
  dark: {
    '--theme-bg': '#1e1e1e',
    '--theme-fg': '#d4d4d4',
    '--theme-surface': '#2d2d2d',
    '--theme-border': '#333333',
    '--theme-accent': '#3794ff',
    '--theme-text-muted': '#858585',
    '--theme-diagnostic-error-bg': '#3b1a1a',
    '--theme-diagnostic-error-border': '#f44336',
    '--theme-diagnostic-warning-bg': '#3b2a0a',
    '--theme-diagnostic-warning-border': '#ffb74d',
  },
} as const;
