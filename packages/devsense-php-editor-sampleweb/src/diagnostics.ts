/**
 * Diagnostics panel: bottom collapsible panel showing current virtual
 * document diagnostics (errors/warnings routed from devsense-php-ls via WS).
 */

export interface DiagnosticMarker {
  uri: string;
  message: string;
  severity: number; // 1=Error, 2=Warning, 3=Information, 4=Hint
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  source?: string;
  code?: string | number;
}

export class DiagnosticsPanel {
  private container: HTMLElement;
  private list: HTMLElement;
  private header: HTMLElement;
  private collapsed = false;
  private markersByUri = new Map<string, DiagnosticMarker[]>();

  constructor(containerId = 'diagnostics-panel') {
    this.container = document.createElement('div');
    this.container.id = containerId;
    this.container.className = 'diagnostics-panel';

    // Header / toggle
    this.header = document.createElement('div');
    this.header.className = 'diagnostics-header';
    this.header.innerHTML = `
      <div class="diagnostics-title">Diagnostics <span class="count">0</span></div>
      <button class="diagnostics-toggle">▾</button>
    `;
    this.header.style.cursor = 'pointer';
    this.header.addEventListener('click', () => this.toggle());
    this.container.appendChild(this.header);

    // List
    this.list = document.createElement('div');
    this.list.className = 'diagnostics-list';
    this.list.style.display = 'none';
    this.container.appendChild(this.list);

    document.body.appendChild(this.container);
  }

  toggle(): void {
    this.collapsed = !this.collapsed;
    this.list.style.display = this.collapsed ? 'none' : 'block';
    const btn = this.header.querySelector('.diagnostics-toggle') as HTMLElement;
    if (btn) btn.textContent = this.collapsed ? '▾' : '▴';
  }

  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.list.style.display = collapsed ? 'none' : 'block';
    const btn = this.header.querySelector('.diagnostics-toggle') as HTMLElement;
    if (btn) btn.textContent = collapsed ? '▾' : '▴';
  }

  /** Replace all diagnostics for a given URI. */
  setDiagnostics(uri: string, markers: DiagnosticMarker[]): void {
    const list: DiagnosticMarker[] = markers.map((m) => ({
      uri,
      message: m.message,
      severity: m.severity,
      startLineNumber: m.startLineNumber,
      startColumn: m.startColumn,
      endLineNumber: m.endLineNumber,
      endColumn: m.endColumn,
      source: m.source,
      code: m.code,
    }));
    this.markersByUri.set(uri, list);
    this.render();
  }

  /** Clear diagnostics for a URI. */
  clearDiagnostics(uri: string): void {
    this.markersByUri.delete(uri);
    this.render();
  }

  /** Total count across all URIs. */
  get totalCount(): number {
    let n = 0;
    for (const v of this.markersByUri.values()) n += v.length;
    return n;
  }

  private render(): void {
    const title = this.header.querySelector('.diagnostics-title') as HTMLElement;
    const countEl = this.header.querySelector('.count') as HTMLElement;
    if (title && countEl) {
      const errorCount = this.totalErrors();
      const warnCount = this.totalWarnings();
      countEl.textContent = `${this.totalCount}` +
        (errorCount ? ` (${errorCount} error${errorCount === 1 ? '' : 's'}` : '') +
        (warnCount ? `, ${warnCount} warning${warnCount === 1 ? '' : 's'}` : '') +
        (errorCount || warnCount ? ')' : '');
    }

    // Build list grouped by URI.
    this.list.innerHTML = '';
    for (const [uri, markers] of this.markersByUri.entries()) {
      if (!markers.length) continue;
      const group = document.createElement('div');
      group.className = 'diagnostic-group';
      const uriShort = uri.replace(/^untitled-workspace-[^\/]+\/\//, '');
      group.innerHTML = `<div class="diagnostic-group-uri">${uriShort}</div>`;
      for (const m of markers) {
        const item = document.createElement('div');
        item.className = `diagnostic-item severity-${m.severity}`;
        const sevLabel = ['', 'Error', 'Warning', 'Info', 'Hint'][m.severity] ?? '?';
        item.innerHTML = `
          <div class="diagnostic-meta">
            <span class="severity">${sevLabel}</span>
            <span class="location">L${m.startLineNumber}:C${m.startColumn}</span>
          </div>
          <div class="diagnostic-message">${this.escapeHtml(m.message)}</div>
        `;
        group.appendChild(item);
      }
      this.list.appendChild(group);
    }
  }

  private totalErrors(): number {
    let n = 0;
    for (const v of this.markersByUri.values())
      for (const m of v) if (m.severity === 1) n++;
    return n;
  }

  private totalWarnings(): number {
    let n = 0;
    for (const v of this.markersByUri.values())
      for (const m of v) if (m.severity === 2) n++;
    return n;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /** Inject default styles. */
  static injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .diagnostics-panel {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        border-top: 1px solid var(--theme-border);
        background: var(--theme-surface);
        color: var(--theme-fg);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        z-index: 1000;
        transition: height 0.2s;
      }
      .diagnostics-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        border-bottom: 1px solid var(--theme-border);
      }
      .diagnostics-title {
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .diagnostics-title .count {
        font-weight: 400;
        color: var(--theme-text-muted);
      }
      .diagnostics-toggle {
        background: none;
        border: none;
        color: var(--theme-fg);
        cursor: pointer;
        padding: 2px;
      }
      .diagnostics-list {
        padding: 8px 12px;
        max-height: 200px;
        overflow-y: auto;
      }
      .diagnostic-group {
        margin-bottom: 8px;
      }
      .diagnostic-group-uri {
        font-size: 10px;
        color: var(--theme-text-muted);
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .diagnostic-item {
        padding: 6px 8px;
        border-left: 3px solid var(--theme-border);
        margin-bottom: 6px;
        background: var(--theme-bg);
      }
      .diagnostic-item.severity-1 { border-left-color: var(--theme-diagnostic-error-border); background: var(--theme-diagnostic-error-bg); }
      .diagnostic-item.severity-2 { border-left-color: var(--theme-diagnostic-warning-border); background: var(--theme-diagnostic-warning-bg); }
      .diagnostic-meta {
        display: flex;
        gap: 10px;
        font-size: 11px;
        margin-bottom: 3px;
      }
      .diagnostic-meta .severity {
        font-weight: 700;
        text-transform: uppercase;
      }
      .diagnostic-meta .location {
        color: var(--theme-text-muted);
      }
      .diagnostic-message {
        font-size: 12px;
        white-space: pre-wrap;
      }
    `;
    document.head.appendChild(style);
  }
}
