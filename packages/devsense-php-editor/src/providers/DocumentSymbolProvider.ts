/**
 * DocumentSymbolProvider — maps Monaco DocumentSymbolProvider to devsense-php-ls
 * LSP request textDocument/documentSymbol.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface DocumentSymbolProviderOptions {
  selector: any;
  languageId: string;
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
        try {
          const result = await this.router.sendRequest('textDocument/documentSymbol', params);
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

  private toDocumentSymbol(s: any): DocumentSymbol {
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

  private toSymbolKind(k?: number): SymbolKind {
    const map: Record<number, SymbolKind> = {
      1: SymbolKind.File, 2: SymbolKind.Module, 3: SymbolKind.Namespace, 4: SymbolKind.Package,
      5: SymbolKind.Class, 6: SymbolKind.Method, 7: SymbolKind.Property, 8: SymbolKind.Field,
      9: SymbolKind.Constructor, 10: SymbolKind.Enum, 11: SymbolKind.Interface, 12: SymbolKind.Function,
      13: SymbolKind.Variable, 14: SymbolKind.Constant, 15: SymbolKind.String, 16: SymbolKind.Number,
      17: SymbolKind.Boolean, 18: SymbolKind.Array, 19: SymbolKind.Object, 20: SymbolKind.Key,
      21: SymbolKind.Null, 22: SymbolKind.EnumMember, 23: SymbolKind.Struct, 24: SymbolKind.Event,
      25: SymbolKind.Operator, 26: SymbolKind.TypeParameter,
    };
    return map[k] ?? SymbolKind.Function;
  }

  private toSymbolTag(t?: number): SymbolTag {
    return t === 1 ? SymbolTag.Deprecated : SymbolTag.Deprecated;
  }
}
