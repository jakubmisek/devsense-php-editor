/**
 * CodeLensProvider — maps Monaco CodeLensProvider to devsense-php-ls
 * LSP request textDocument/codeLens.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface CodeLensProviderOptions {
  selector: any;
  languageId: string;
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
        try {
          const result = await this.router.sendRequest('textDocument/codeLens', params);
          if (!result || !Array.isArray(result)) return null;
          return {
            lenses: result.map((l: any) => ({
              range: this.fromLspRange(l.range),
              id: l.id,
              command: l.command ? { id: l.command.id, title: l.command.title, arguments: l.command.arguments } : undefined,
            })),
            dispose: () => { /* no-op */ },
          };
        } catch (err) {
          console.error('CodeLensProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerCodeLensProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
