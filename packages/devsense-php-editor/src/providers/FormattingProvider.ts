/**
 * FormattingProvider — maps Monaco DocumentFormattingEditProvider to devsense-php-ls
 * LSP request textDocument/formatting.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface FormattingProviderOptions {
  selector: any;
  languageId: string;
}

export class FormattingProvider extends BaseProvider {
  constructor(router: any, options: FormattingProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      provideDocumentFormattingEdits: async (model: any, options: FormattingOptions, token: CancellationToken): Promise<ProviderResult<TextEdit[]>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          options: {
            tabSize: options.tabSize,
            insertSpaces: options.insertSpaces,
          },
        };
        try {
          const result = await this.router.sendRequest('textDocument/formatting', params);
          if (!result || !Array.isArray(result)) return null;
          return result.map((e: any) => ({
            range: this.fromLspRange(e.range),
            text: e.text,
          }));
        } catch (err) {
          console.error('FormattingProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerDocumentFormattingEditProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
