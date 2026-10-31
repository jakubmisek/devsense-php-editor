/**
 * RangeFormattingProvider — maps Monaco DocumentRangeFormattingEditProvider to devsense-php-ls
 * LSP request textDocument/rangeFormatting.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';
import { TextEdit, FormattingOptions, Position, CancellationToken, ProviderResult, Range } from 'monaco-editor';

export interface RangeFormattingProviderOptions {
  selector: any;
  languageId: string;
}

export class RangeFormattingProvider extends BaseProvider {
  constructor(router: any, options: RangeFormattingProviderOptions) {
    super(router, options.languageId, options.selector);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      provideDocumentRangeFormattingEdits: async (model: any, range: Range, options: FormattingOptions, token: CancellationToken): Promise<ProviderResult<TextEdit[]>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          range: this.toLspRange(range),
          options: {
            tabSize: options.tabSize,
            insertSpaces: options.insertSpaces,
          },
        };
        try {
          const result = await this.router.sendRequest('textDocument/rangeFormatting', params);
          if (!result || !Array.isArray(result)) return null;
          return result.map((e: any) => ({
            range: this.fromLspRange(e.range),
            text: e.text,
          }));
        } catch (err) {
          console.error('RangeFormattingProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerDocumentRangeFormattingEditProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
