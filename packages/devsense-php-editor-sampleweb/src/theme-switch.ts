/**
 * Icon-only three-state theme switch (light / dark / system) for the top bar.
 * Accessible radiogroup: roving tabindex, arrow/Home/End keys, aria-checked.
 */
export type ThemeChoice = 'light' | 'dark' | 'automatic';

const ICONS: Record<ThemeChoice, string> = {
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  dark: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  automatic: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
};

const OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'light', label: 'Light theme' },
  { value: 'dark', label: 'Dark theme' },
  { value: 'automatic', label: 'System theme' },
];

export function createThemeSwitch(initial: ThemeChoice, onChange: (value: ThemeChoice) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'theme-switch';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Color theme');
  group.dataset.testid = 'theme-switch';

  const buttons = OPTIONS.map(({ value, label }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme-switch-option';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', label);
    b.title = label;
    b.dataset.value = value;
    b.dataset.testid = `theme-option-${value === 'automatic' ? 'system' : value}`;
    b.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[value]}</svg>`;
    group.appendChild(b);
    return b;
  });

  const select = (value: ThemeChoice, focus: boolean) => {
    for (const b of buttons) {
      const on = b.dataset.value === value;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
  };

  buttons.forEach((b, i) => {
    b.addEventListener('click', () => {
      const value = b.dataset.value as ThemeChoice;
      if (b.getAttribute('aria-checked') === 'true') return;
      select(value, false);
      onChange(value);
    });
    b.addEventListener('keydown', (e) => {
      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % buttons.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + buttons.length) % buttons.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = buttons.length - 1;
      if (next < 0) return;
      e.preventDefault();
      const value = buttons[next].dataset.value as ThemeChoice;
      select(value, true);
      onChange(value);
    });
  });

  select(initial, false);
  return group;
}

export const THEME_SWITCH_CSS = `
  .theme-switch {
    display: inline-flex; gap: 2px; padding: 2px;
    background: var(--theme-bg); border: 1px solid var(--theme-border); border-radius: 8px;
  }
  .theme-switch-option {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 26px; padding: 0; border: 0; border-radius: 6px;
    background: transparent; color: var(--theme-text-muted); cursor: pointer;
    transition: background-color .15s ease, color .15s ease, box-shadow .15s ease;
  }
  .theme-switch-option:hover { color: var(--theme-fg); background: color-mix(in srgb, var(--theme-fg) 8%, transparent); }
  .theme-switch-option[aria-checked="true"] {
    color: var(--theme-accent); background: var(--theme-surface);
    box-shadow: 0 1px 2px rgba(0,0,0,.18), inset 0 0 0 1px var(--theme-border);
  }
  .theme-switch-option:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 1px; }
`;
