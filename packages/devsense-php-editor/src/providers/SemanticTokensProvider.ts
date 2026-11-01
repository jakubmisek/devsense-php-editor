/**
 * SemanticTokensProvider — maps Monaco DocumentSemanticTokensProvider to devsense-php-ls
 * LSP request textDocument/semanticTokens/full.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface SemanticTokensProviderOptions {
  selector: any;
  languageId: string;
  legend: SemanticTokensLegend;
}

export class SemanticTokensProvider extends BaseProvider {
  private readonly legend: SemanticTokensLegend;

  constructor(router: any, options: SemanticTokensProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
    this.legend = options.legend;
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      getLegend: () => this.legend,
      provideDocumentSemanticTokens: async (model: any, lastResultId: string | null, token: CancellationToken): Promise<ProviderResult<SemanticTokens>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
        };
        try {
          const result = await this.router.sendRequest('textDocument/semanticTokens/full', params);
          if (!result) return null;
          return {
            resultId: result.resultId,
            data: result.data ? new Uint32Array(result.data) : new Uint32Array(0),
          };
        } catch (err) {
          console.error('SemanticTokensProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerDocumentSemanticTokensProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
