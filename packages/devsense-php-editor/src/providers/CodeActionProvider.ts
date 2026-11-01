/**
 * CodeActionProvider — maps Monaco CodeActionProvider to devsense-php-ls
 * LSP request textDocument/codeAction.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface CodeActionProviderOptions {
  selector: any;
  languageId: string;
  monaco: any;
}

export class CodeActionProvider extends BaseProvider {
  constructor(router: any, options: CodeActionProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      provideCodeActions: async (model: any, range: any, context: any, token: CancellationToken): Promise<ProviderResult<any>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          range: this.toLspRange(range),
          context: {
            // Monaco passes the markers overlapping the range as context.markers.
            diagnostics: (context.markers || context.diagnostics || []).map((d: any) => ({
              range: this.toLspRange(d.range ?? d),
              severity: d.severity,
              code: d.code,
              source: d.source,
              message: d.message,
            })),
            only: context.only,
          },
        };
        console.log('[CodeActionProvider] Sending textDocument/codeAction for', params.textDocument.uri);
        try {
          const result = await this.router.sendRequest('textDocument/codeAction', params);
          console.log('[CodeActionProvider] Got code actions:', result?.length ?? 0, 'actions');
          if (!result || !Array.isArray(result)) return { actions: [], dispose: () => {} };
          const actions = result.map((a: any) => ({
            title: a.title,
            command: a.command ? { id: a.command.command ?? a.command, title: a.command.title ?? a.title, arguments: a.command.arguments } : undefined,
            edit: this.toMonacoWorkspaceEdit(a.edit),
            diagnostics: a.diagnostics,
            kind: a.kind,
            isPreferred: a.isPreferred,
            disabled: a.disabled?.reason ?? a.disabled,
          }));
          return { actions, dispose: () => { /* no-op */ } };
        } catch (err) {
          console.error('CodeActionProvider error:', err);
          return { actions: [], dispose: () => {} };
        }
      },
    };
    const disp = monaco.languages.registerCodeActionProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
