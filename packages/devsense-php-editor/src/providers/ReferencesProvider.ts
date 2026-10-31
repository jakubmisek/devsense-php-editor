/**
 * ReferencesProvider — maps Monaco ReferenceProvider to devsense-php-ls
 * LSP request textDocument/references.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';
import { Location, Position, CancellationToken, ProviderResult } from 'monaco-editor';

export interface ReferencesProviderOptions {
  selector: any;
  languageId: string;
}

export class ReferencesProvider extends BaseProvider {
  constructor(router: any, options: ReferencesProviderOptions) {
    super(router, options.languageId, options.selector);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      provideReferences: async (model: any, position: Position, context: any, token: CancellationToken): Promise<ProviderResult<Location[]>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          context: { includeDeclaration: context.includeDeclaration ?? true },
        };
        try {
          const result = await this.router.sendRequest('textDocument/references', params);
          if (!result || !Array.isArray(result)) return null;
          return result.map((loc: any) => this.fromLspLocation(loc));
        } catch (err) {
          console.error('ReferencesProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerReferenceProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
