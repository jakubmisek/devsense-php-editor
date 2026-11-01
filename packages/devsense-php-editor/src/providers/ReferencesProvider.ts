/**
 * ReferencesProvider — maps Monaco ReferenceProvider to devsense-php-ls LSP request textDocument/references.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export type ReferencesProviderOptions = BaseProviderOptions;

export class ReferencesProvider extends BaseProvider {
  constructor(router: LspRequestSender, options: ReferencesProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.ReferenceProvider = {
      provideReferences: async (model, position, context, _token) => {
        const params: lsp.ReferenceParams = {
          textDocument: this.toTextDocument(model),
          position: this.toLspPosition(position),
          context: { includeDeclaration: context.includeDeclaration ?? true },
        };
        console.log('[ReferencesProvider] Sending textDocument/references for', params.textDocument.uri);
        try {
          const result = await this.request<lsp.Location[]>('textDocument/references', params);
          console.log('[ReferencesProvider] Got references result:', result?.length ?? 0, 'locations');
          return result ? result.map((loc) => this.fromLspLocation(loc)) : null;
        } catch (err) {
          console.error('ReferencesProvider error:', err);
          return null;
        }
      },
    };
    this.disposables.push(monacoApi.languages.registerReferenceProvider(this.selector, provider));
  }
}
