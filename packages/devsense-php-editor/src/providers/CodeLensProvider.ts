/**
 * CodeLensProvider — maps Monaco CodeLensProvider to devsense-php-ls
 * LSP request textDocument/codeLens.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface CodeLensProviderOptions {
  selector: any;
  languageId: string;
  monaco: any;
}

export class CodeLensProvider extends BaseProvider {
  constructor(router: any, options: CodeLensProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      provideCodeLenses: async (model: any, token: CancellationToken): Promise<ProviderResult<CodeLensList>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
        };
        console.log('[CodeLensProvider] Sending textDocument/codeLens for', params.textDocument.uri);
        try {
          const result = await this.router.sendRequest('textDocument/codeLens', params);
          console.log('[CodeLensProvider] Got code lenses:', result?.length ?? 0, 'lenses');
          if (!result || !Array.isArray(result)) return null;
          return {
            lenses: result.map((l: any) => ({
              range: this.fromLspRange(l.range),
              id: l.id,
              command: l.command ? { id: l.command.command ?? '', title: l.command.title, arguments: l.command.arguments } : undefined,
              __lsp: l,
            })),
            dispose: () => { /* no-op */ },
          };
        } catch (err) {
          console.error('CodeLensProvider error:', err);
          return null;
        }
      },
      resolveCodeLens: async (_model: any, lens: any, _token: CancellationToken): Promise<any> => {
        if (lens.command || !lens.__lsp) return lens;
        try {
          const r = await this.router.sendRequest('codeLens/resolve', lens.__lsp);
          if (r?.command) lens.command = { id: r.command.command ?? '', title: r.command.title, arguments: r.command.arguments };
        } catch (err) {
          console.error('CodeLensProvider resolve error:', err);
        }
        return lens;
      },
    };
    const disp = monaco.languages.registerCodeLensProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
