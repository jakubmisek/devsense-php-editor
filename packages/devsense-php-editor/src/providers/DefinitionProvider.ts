/**
 * DefinitionProvider — maps Monaco DefinitionProvider to devsense-php-ls
 * LSP request textDocument/definition.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface DefinitionProviderOptions {
  selector: any;
  languageId: string;
}

export class DefinitionProvider extends BaseProvider {
  constructor(router: any, options: DefinitionProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      provideDefinition: async (model: any, position: Position, token: CancellationToken): Promise<ProviderResult<Definition>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
        };
        try {
          const result = await this.router.sendRequest('textDocument/definition', params);
          if (!result) return null;
          const locations = Array.isArray(result) ? result : [result];
          return locations.map((loc: any) => this.fromLspLocation(loc));
        } catch (err) {
          console.error('DefinitionProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerDefinitionProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
