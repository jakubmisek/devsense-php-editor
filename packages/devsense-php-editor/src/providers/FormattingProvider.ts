/**
 * FormattingProvider — maps Monaco DocumentFormattingEditProvider to devsense-php-ls
 * LSP request textDocument/formatting.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface FormattingProviderOptions {
  selector: any;
  languageId: string;
  monaco: any;
}

export class FormattingProvider extends BaseProvider {
  constructor(router: any, options: FormattingProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      provideDocumentFormattingEdits: async (model: any, options: FormattingOptions, token: CancellationToken): Promise<ProviderResult<TextEdit[]>> => {
        // devsense-php-ls implements formatting via textDocument/rangeFormatting only
        // (documentFormattingProvider: false), so format the full document range.
        const lastLine = model.getLineCount();
        const params = {
          textDocument: { uri: model.uri.toString() },
          range: {
            start: { line: 0, character: 0 },
            end: { line: lastLine - 1, character: model.getLineMaxColumn(lastLine) - 1 },
          },
          options: {
            tabSize: options.tabSize,
            insertSpaces: options.insertSpaces,
          },
        };
        console.log('[FormattingProvider] Sending textDocument/rangeFormatting (full document) for', params.textDocument.uri);
        try {
          const result = await this.router.sendRequest('textDocument/rangeFormatting', params);
          console.log('[FormattingProvider] Got formatting edits:', result?.length ?? 0, 'edits');
          if (!result || !Array.isArray(result)) return null;
          return result.map((e: any) => ({
            range: this.fromLspRange(e.range),
            text: e.newText,
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
