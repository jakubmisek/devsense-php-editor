/**
 * RangeFormattingProvider — maps Monaco DocumentRangeFormattingEditProvider to devsense-php-ls LSP request textDocument/rangeFormatting.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export type RangeFormattingProviderOptions = BaseProviderOptions;

export class RangeFormattingProvider extends BaseProvider {
  constructor(router: LspRequestSender, options: RangeFormattingProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.DocumentRangeFormattingEditProvider = {
      provideDocumentRangeFormattingEdits: async (model, range, options, _token) => {
        const params: lsp.DocumentRangeFormattingParams = {
          textDocument: this.toTextDocument(model),
          range: this.toLspRange(range),
          options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces },
        };
        console.log('[RangeFormattingProvider] Sending textDocument/rangeFormatting for', params.textDocument.uri);
        try {
          const result = await this.request<lsp.TextEdit[]>('textDocument/rangeFormatting', params);
          console.log('[RangeFormattingProvider] Got range formatting edits:', result?.length ?? 0, 'edits');
          return result ? this.fromLspTextEdits(result) : null;
        } catch (err) {
          console.error('RangeFormattingProvider error:', err);
          return null;
        }
      },
    };
    this.disposables.push(monacoApi.languages.registerDocumentRangeFormattingEditProvider(this.selector, provider));
  }
}
