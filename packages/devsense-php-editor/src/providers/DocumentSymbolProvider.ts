/**
 * DocumentSymbolProvider — maps Monaco DocumentSymbolProvider to devsense-php-ls
 * LSP request textDocument/documentSymbol.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface DocumentSymbolProviderOptions {
  selector: any;
  languageId: string;
  monaco: any;
}

export class DocumentSymbolProvider extends BaseProvider {
  constructor(router: any, options: DocumentSymbolProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      provideDocumentSymbols: async (model: any, token: CancellationToken): Promise<ProviderResult<DocumentSymbol[]>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
        };
        console.log('[DocumentSymbolProvider] Sending textDocument/documentSymbol for', params.textDocument.uri);
        try {
          const result = await this.router.sendRequest('textDocument/documentSymbol', params);
          console.log('[DocumentSymbolProvider] Got document symbols:', result?.length ?? 0, 'symbols');
          if (!result || !Array.isArray(result)) return null;
          return result.map((s: any) => this.toDocumentSymbol(s));
        } catch (err) {
          console.error('DocumentSymbolProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerDocumentSymbolProvider(this.selector, provider);
    this.disposables.push(disp);
  }

  private toDocumentSymbol(s: any): any {
    const kind = this.toSymbolKind(s.kind);
    return {
      name: s.name,
      detail: s.detail ?? '',
      kind,
      tags: s.tags ? s.tags.map((t: number) => this.toSymbolTag(t)) : [],
      containerName: s.containerName,
      range: this.fromLspRange(s.range),
      selectionRange: this.fromLspRange(s.selectionRange ?? s.range),
      children: s.children ? s.children.map((c: any) => this.toDocumentSymbol(c)) : undefined,
    };
  }

  private toSymbolKind(k?: number): any {
    const map: Record<number, any> = {
      1: this.monaco.SymbolKind.File, 2: this.monaco.SymbolKind.Module, 3: this.monaco.SymbolKind.Namespace, 4: this.monaco.SymbolKind.Package,
      5: this.monaco.SymbolKind.Class, 6: this.monaco.SymbolKind.Method, 7: this.monaco.SymbolKind.Property, 8: this.monaco.SymbolKind.Field,
      9: this.monaco.SymbolKind.Constructor, 10: this.monaco.SymbolKind.Enum, 11: this.monaco.SymbolKind.Interface, 12: this.monaco.SymbolKind.Function,
      13: this.monaco.SymbolKind.Variable, 14: this.monaco.SymbolKind.Constant, 15: this.monaco.SymbolKind.String, 16: this.monaco.SymbolKind.Number,
      17: this.monaco.SymbolKind.Boolean, 18: this.monaco.SymbolKind.Array, 19: this.monaco.SymbolKind.Object, 20: this.monaco.SymbolKind.Key,
      21: this.monaco.SymbolKind.Null, 22: this.monaco.SymbolKind.EnumMember, 23: this.monaco.SymbolKind.Struct, 24: this.monaco.SymbolKind.Event,
      25: this.monaco.SymbolKind.Operator, 26: this.monaco.SymbolKind.TypeParameter,
    };
    return (k != null ? map[k] : undefined) ?? this.monaco.SymbolKind.Function;
  }

  private toSymbolTag(t?: number): any {
    return t === 1 ? this.monaco.SymbolTag.Deprecated : this.monaco.SymbolTag.Deprecated;
  }
}
