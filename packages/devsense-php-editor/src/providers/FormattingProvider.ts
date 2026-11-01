/**
 * FormattingProvider — maps Monaco DocumentFormattingEditProvider to devsense-php-ls LSP request textDocument/rangeFormatting (full document).
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export type FormattingProviderOptions = BaseProviderOptions;

export class FormattingProvider extends BaseProvider {
  constructor(router: LspRequestSender, options: FormattingProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.DocumentFormattingEditProvider = {
      provideDocumentFormattingEdits: async (model, options, _token) => {
        // devsense-php-ls implements formatting via textDocument/rangeFormatting only
        // (documentFormattingProvider: false), so format the full document range.
        const params: lsp.DocumentRangeFormattingParams = {
          textDocument: this.toTextDocument(model),
          range: this.toLspRange(model.getFullModelRange()),
          options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces },
        };
        console.log('[FormattingProvider] Sending textDocument/rangeFormatting (full document) for', params.textDocument.uri);
        try {
          const result = await this.request<lsp.TextEdit[]>('textDocument/rangeFormatting', params);
          console.log('[FormattingProvider] Got formatting edits:', result?.length ?? 0, 'edits');
          return result ? this.fromLspTextEdits(result) : null;
        } catch (err) {
          console.error('FormattingProvider error:', err);
          return null;
        }
      },
    };
    this.disposables.push(monacoApi.languages.registerDocumentFormattingEditProvider(this.selector, provider));
  }
}
