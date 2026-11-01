/**
 * CodeActionProvider — maps Monaco CodeActionProvider to devsense-php-ls LSP request textDocument/codeAction.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export type CodeActionProviderOptions = BaseProviderOptions;

let nextCommandId = 1;

/**
 * Code actions from devsense-php-ls come as `CodeAction` literals with a `WorkspaceEdit`
 * (applied by Monaco directly) and/or a `Command`. LSP commands are executed on the server
 * via `workspace/executeCommand`; any `workspace/applyEdit` the server sends back is applied by
 * the editor component (see createPhpEditor). Each provider instance registers its own Monaco
 * command id so several editors on one page (each with its own connection) don't collide.
 */
export class CodeActionProvider extends BaseProvider {
  /** Monaco command id that forwards an LSP Command to `workspace/executeCommand`. */
  readonly executeCommandId = `devsense-php-editor.codeAction.executeCommand.${nextCommandId++}`;

  constructor(router: LspRequestSender, options: CodeActionProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monacoApi: MonacoApi): void {
    this.disposables.push(monacoApi.editor.registerCommand(this.executeCommandId, (_accessor: unknown, cmd: unknown) => {
      const command = cmd as lsp.Command | undefined;
      if (!command?.command) return;
      const params: lsp.ExecuteCommandParams = { command: command.command, arguments: command.arguments };
      this.request('workspace/executeCommand', params).catch((err: unknown) => console.error('CodeActionProvider executeCommand error:', err));
    }));
    const origin = new WeakMap<monaco.languages.CodeAction, lsp.CodeAction>();
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
          const actions = result.map((a): monaco.languages.CodeAction => {
            if (typeof a.command === 'string') return { title: a.title, command: this.toMonacoCommand(a as lsp.Command) };
            const action = this.fromLspCodeAction(a as lsp.CodeAction);
            origin.set(action, a as lsp.CodeAction);
            return action;
          });
          return { actions, dispose: () => { /* no-op */ } };
        } catch (err) {
          console.error('CodeActionProvider error:', err);
          return empty;
        }
      },
      // devsense-php-ls advertises resolveProvider: edits may be computed lazily via codeAction/resolve.
      resolveCodeAction: async (action, _token) => {
        const lspAction = origin.get(action);
        if (!lspAction || action.edit) return action;
        try {
          const resolved = await this.request<lsp.CodeAction>('codeAction/resolve', lspAction);
          if (!resolved) return action;
          return { ...action, edit: this.fromLspWorkspaceEdit(resolved.edit), command: this.toMonacoCommand(resolved.command) ?? action.command };
        } catch (err) {
          console.error('CodeActionProvider resolve error:', err);
          return action;
        }
      },
    };
    this.disposables.push(monacoApi.languages.registerCodeActionProvider(this.selector, provider));
  }

  private fromLspCodeAction(a: lsp.CodeAction): monaco.languages.CodeAction {
    return {
      title: a.title,
      command: this.toMonacoCommand(a.command),
      edit: this.fromLspWorkspaceEdit(a.edit),
      diagnostics: a.diagnostics?.map((d) => this.fromLspDiagnostic(d)),
      kind: a.kind,
      isPreferred: a.isPreferred,
      disabled: a.disabled?.reason,
    };
  }

  /** Wrap an LSP Command so Monaco runs it through our registered executeCommand bridge. */
  private toMonacoCommand(cmd: lsp.Command | undefined): monaco.languages.Command | undefined {
    return cmd ? { id: this.executeCommandId, title: cmd.title, arguments: [cmd] } : undefined;
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
