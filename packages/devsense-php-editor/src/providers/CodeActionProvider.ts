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
      provideCodeActions: async (model: any, range: Range, context: any, token: CancellationToken): Promise<ProviderResult<CodeAction[]>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          range: this.toLspRange(range),
          context: {
            diagnostics: (context.diagnostics || []).map((d: any) => ({
              range: this.toLspRange(d.range),
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
          if (!result || !Array.isArray(result)) return null;
          return result.map((a: any) => ({
            title: a.title,
            command: a.command ? { id: a.command.command, title: a.command.title, arguments: a.command.arguments } : undefined,
            edit: a.edit,
            diagnostics: a.diagnostics,
            kind: a.kind,
            isPreferred: a.isPreferred,
            disabled: a.disabled,
          }));
        } catch (err) {
          console.error('CodeActionProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerCodeActionProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
