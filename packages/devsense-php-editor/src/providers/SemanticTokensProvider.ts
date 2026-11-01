/**
 * SemanticTokensProvider — maps Monaco DocumentSemanticTokensProvider to devsense-php-ls LSP request textDocument/semanticTokens/full.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export interface SemanticTokensProviderOptions extends BaseProviderOptions {
  legend: monaco.languages.SemanticTokensLegend;
}

export class SemanticTokensProvider extends BaseProvider {
  private readonly legend: monaco.languages.SemanticTokensLegend;

  constructor(router: LspRequestSender, options: SemanticTokensProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
    this.legend = options.legend;
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.DocumentSemanticTokensProvider = {
      getLegend: () => this.legend,
      provideDocumentSemanticTokens: async (model, _lastResultId, _token) => {
        const params: lsp.SemanticTokensParams = { textDocument: this.toTextDocument(model) };
        console.log('[SemanticTokensProvider] Sending textDocument/semanticTokens/full for', params.textDocument.uri);
        try {
          const result = await this.request<lsp.SemanticTokens>('textDocument/semanticTokens/full', params);
          console.log('[SemanticTokensProvider] Got semantic tokens:', result?.data?.length ?? 0, 'tokens');
          if (!result) return null;
          return { resultId: result.resultId, data: new Uint32Array(result.data ?? []) };
        } catch (err) {
          console.error('SemanticTokensProvider error:', err);
          return null;
        }
      },
      releaseDocumentSemanticTokens: () => { /* nothing cached */ },
    };
    this.disposables.push(monacoApi.languages.registerDocumentSemanticTokensProvider(this.selector, provider));
  }
}
