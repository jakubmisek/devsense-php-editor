/**
 * DocumentSymbolProvider — maps Monaco DocumentSymbolProvider to devsense-php-ls LSP request textDocument/documentSymbol.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export type DocumentSymbolProviderOptions = BaseProviderOptions;

export class DocumentSymbolProvider extends BaseProvider {
  constructor(router: LspRequestSender, options: DocumentSymbolProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.DocumentSymbolProvider = {
      provideDocumentSymbols: async (model, _token) => {
        const params: lsp.DocumentSymbolParams = { textDocument: this.toTextDocument(model) };
        console.log('[DocumentSymbolProvider] Sending textDocument/documentSymbol for', params.textDocument.uri);
        try {
          const result = await this.request<lsp.DocumentSymbol[] | lsp.SymbolInformation[]>('textDocument/documentSymbol', params);
          console.log('[DocumentSymbolProvider] Got document symbols:', result?.length ?? 0, 'symbols');
          if (!result) return null;
          return result.map((s) => ('location' in s ? this.fromSymbolInformation(s) : this.fromDocumentSymbol(s)));
        } catch (err) {
          console.error('DocumentSymbolProvider error:', err);
          return null;
        }
      },
    };
    this.disposables.push(monacoApi.languages.registerDocumentSymbolProvider(this.selector, provider));
  }

  private fromDocumentSymbol(s: lsp.DocumentSymbol): monaco.languages.DocumentSymbol {
    return {
      name: s.name,
      detail: s.detail ?? '',
      kind: this.toSymbolKind(s.kind),
      tags: this.toSymbolTags(s.tags),
      range: this.fromLspRange(s.range),
      selectionRange: this.fromLspRange(s.selectionRange ?? s.range),
      children: s.children?.map((c) => this.fromDocumentSymbol(c)),
    };
  }

  private fromSymbolInformation(s: lsp.SymbolInformation): monaco.languages.DocumentSymbol {
    const range = this.fromLspRange(s.location.range);
    return { name: s.name, detail: '', kind: this.toSymbolKind(s.kind), tags: this.toSymbolTags(s.tags), containerName: s.containerName, range, selectionRange: range };
  }

  /** LSP SymbolKind is 1-based (File=1); Monaco's is the same order, 0-based (File=0). */
  private toSymbolKind(k: lsp.SymbolKind): monaco.languages.SymbolKind {
    return (k >= 1 && k <= 26 ? k - 1 : this.monaco.languages.SymbolKind.Function) as monaco.languages.SymbolKind;
  }

  /** LSP and Monaco SymbolTag share values (Deprecated=1). */
  private toSymbolTags(tags: lsp.SymbolTag[] | undefined): monaco.languages.SymbolTag[] {
    return (tags ?? []).filter((t) => t === 1).map(() => this.monaco.languages.SymbolTag.Deprecated);
  }
}
