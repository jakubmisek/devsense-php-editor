/**
 * RenameProvider — maps Monaco RenameProvider to devsense-php-ls LSP request textDocument/rename.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export type RenameProviderOptions = BaseProviderOptions;

export class RenameProvider extends BaseProvider {
  constructor(router: LspRequestSender, options: RenameProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.RenameProvider = {
      provideRenameEdits: async (model, position, newName, _token) => {
        const params: lsp.RenameParams = { textDocument: this.toTextDocument(model), position: this.toLspPosition(position), newName };
        console.log('[RenameProvider] Sending textDocument/rename for', params.textDocument.uri);
        try {
          const result = await this.request<lsp.WorkspaceEdit>('textDocument/rename', params);
          console.log('[RenameProvider] Got rename result:', !!result);
          return this.fromLspWorkspaceEdit(result) ?? null;
        } catch (err) {
          console.error('RenameProvider error:', err);
          // Surface the server's reason (e.g. "Cannot rename a built-in symbol") in the editor.
          return { edits: [], rejectReason: err instanceof Error ? err.message : String(err) };
        }
      },
    };
    this.disposables.push(monacoApi.languages.registerRenameProvider(this.selector, provider));
  }
}
