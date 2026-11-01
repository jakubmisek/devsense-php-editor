/**
 * CodeActionProvider — maps Monaco CodeActionProvider to devsense-php-ls LSP request textDocument/codeAction.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export type CodeActionProviderOptions = BaseProviderOptions;

export class CodeActionProvider extends BaseProvider {
  constructor(router: LspRequestSender, options: CodeActionProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monacoApi: MonacoApi): void {
    const empty: monaco.languages.CodeActionList = { actions: [], dispose: () => { /* no-op */ } };
    const provider: monaco.languages.CodeActionProvider = {
      provideCodeActions: async (model, range, context, _token) => {
        const params: lsp.CodeActionParams = {
          textDocument: this.toTextDocument(model),
          range: this.toLspRange(range),
          context: {
            // Monaco passes the markers overlapping the range as context.markers.
            diagnostics: context.markers.map((m) => this.toLspDiagnostic(m)),
            only: context.only ? [context.only] : undefined,
          },
        };
        console.log('[CodeActionProvider] Sending textDocument/codeAction for', params.textDocument.uri);
        try {
          const result = await this.request<Array<lsp.Command | lsp.CodeAction>>('textDocument/codeAction', params);
          console.log('[CodeActionProvider] Got code actions:', result?.length ?? 0, 'actions');
          if (!result) return empty;
          const actions = result.map((a): monaco.languages.CodeAction =>
            typeof a.command === 'string'
              ? { title: a.title, command: this.fromLspCommand(a as lsp.Command) }
              : this.fromLspCodeAction(a as lsp.CodeAction));
          return { actions, dispose: () => { /* no-op */ } };
        } catch (err) {
          console.error('CodeActionProvider error:', err);
          return empty;
        }
      },
    };
    this.disposables.push(monacoApi.languages.registerCodeActionProvider(this.selector, provider));
  }

  private fromLspCodeAction(a: lsp.CodeAction): monaco.languages.CodeAction {
    return {
      title: a.title,
      command: this.fromLspCommand(a.command),
      edit: this.fromLspWorkspaceEdit(a.edit),
      diagnostics: a.diagnostics?.map((d) => this.fromLspDiagnostic(d)),
      kind: a.kind,
      isPreferred: a.isPreferred,
      disabled: a.disabled?.reason,
    };
  }

  // LSP DiagnosticSeverity: Error=1, Warning=2, Information=3, Hint=4.
  // Monaco MarkerSeverity:  Hint=1, Info=2, Warning=4, Error=8.
  private toLspDiagnostic(m: monaco.editor.IMarkerData): lsp.Diagnostic {
    const S = this.monaco.MarkerSeverity;
    const severity: lsp.DiagnosticSeverity = m.severity === S.Error ? 1 : m.severity === S.Warning ? 2 : m.severity === S.Info ? 3 : 4;
    return {
      range: this.toLspRange(m),
      severity,
      code: typeof m.code === 'object' ? m.code.value : m.code,
      source: m.source,
      message: m.message,
    };
  }

  private fromLspDiagnostic(d: lsp.Diagnostic): monaco.editor.IMarkerData {
    const S = this.monaco.MarkerSeverity;
    const r = this.fromLspRange(d.range);
    return {
      severity: d.severity === 1 ? S.Error : d.severity === 2 ? S.Warning : d.severity === 3 ? S.Info : S.Hint,
      message: d.message,
      source: d.source,
      code: d.code !== undefined ? String(d.code) : undefined,
      startLineNumber: r.startLineNumber,
      startColumn: r.startColumn,
      endLineNumber: r.endLineNumber,
      endColumn: r.endColumn,
    };
  }
}
