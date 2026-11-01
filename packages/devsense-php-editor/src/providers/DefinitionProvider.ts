/**
 * DefinitionProvider — maps Monaco DefinitionProvider to devsense-php-ls LSP request textDocument/definition.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export type DefinitionProviderOptions = BaseProviderOptions;

export class DefinitionProvider extends BaseProvider {
  constructor(router: LspRequestSender, options: DefinitionProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.DefinitionProvider = {
      provideDefinition: async (model, position, _token) => {
        const params: lsp.DefinitionParams = { textDocument: this.toTextDocument(model), position: this.toLspPosition(position) };
        console.log('[DefinitionProvider] Sending textDocument/definition for', params.textDocument.uri);
        try {
          const result = await this.request<lsp.Definition | lsp.LocationLink[]>('textDocument/definition', params);
          const locations: Array<lsp.Location | lsp.LocationLink> = !result ? [] : Array.isArray(result) ? result : [result];
          console.log('[DefinitionProvider] Got definition result:', locations.length, 'locations');
          return result ? locations.map((loc) => this.fromLspLocation(loc)) : null;
        } catch (err) {
          console.error('DefinitionProvider error:', err);
          return null;
        }
      },
    };
    this.disposables.push(monacoApi.languages.registerDefinitionProvider(this.selector, provider));
  }
}
