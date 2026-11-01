/**
 * HoverProvider — maps Monaco HoverProvider to devsense-php-ls LSP request textDocument/hover.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export type HoverProviderOptions = BaseProviderOptions;

export class HoverProvider extends BaseProvider {
  constructor(router: LspRequestSender, options: HoverProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.HoverProvider = {
      provideHover: async (model, position, _token) => {
        const params: lsp.HoverParams = { textDocument: this.toTextDocument(model), position: this.toLspPosition(position) };
        console.log('[HoverProvider] Sending textDocument/hover for', params.textDocument.uri);
        try {
          const result = await this.request<lsp.Hover>('textDocument/hover', params);
          console.log('[HoverProvider] Got hover result:', !!result?.contents);
          if (!result?.contents) return null;
          const parts = Array.isArray(result.contents) ? result.contents : [result.contents];
          const contents = parts.map((c): monaco.IMarkdownString => {
            const md = this.fromLspMarkup(c);
            return typeof md === 'string' ? { value: md } : md ?? { value: '' };
          });
          return { contents, range: result.range ? this.fromLspRange(result.range) : undefined };
        } catch (err) {
          console.error('HoverProvider error:', err);
          return null;
        }
      },
    };
    this.disposables.push(monacoApi.languages.registerHoverProvider(this.selector, provider));
  }
}
