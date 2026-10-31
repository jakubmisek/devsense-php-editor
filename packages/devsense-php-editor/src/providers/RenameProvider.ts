/**
 * RenameProvider — maps Monaco RenameProvider to devsense-php-ls
 * LSP request textDocument/rename.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';
import { Position, CancellationToken, ProviderResult, Range } from 'monaco-editor';

export interface RenameProviderOptions {
  selector: any;
  languageId: string;
}

export class RenameProvider extends BaseProvider {
  constructor(router: any, options: RenameProviderOptions) {
    super(router, options.languageId, options.selector);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      provideRenameEdits: async (model: any, position: Position, newName: string, token: CancellationToken): Promise<ProviderResult<any>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          newName,
        };
        try {
          const result = await this.router.sendRequest('textDocument/rename', params);
          return result;
        } catch (err) {
          console.error('RenameProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerRenameProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
