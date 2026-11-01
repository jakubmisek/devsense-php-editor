/**
 * OnTypeFormattingProvider — maps Monaco OnTypeFormattingEditProvider to devsense-php-ls LSP request textDocument/onTypeFormatting.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export interface OnTypeFormattingProviderOptions extends BaseProviderOptions {
  autoFormatTriggerCharacters?: string[];
}

export class OnTypeFormattingProvider extends BaseProvider {
  private readonly autoFormatTriggerCharacters: string[];

  constructor(router: LspRequestSender, options: OnTypeFormattingProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
    this.autoFormatTriggerCharacters = options.autoFormatTriggerCharacters ?? ['}', ')', ';'];
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.OnTypeFormattingEditProvider = {
      autoFormatTriggerCharacters: this.autoFormatTriggerCharacters,
      provideOnTypeFormattingEdits: async (model, position, ch, options, _token) => {
        const params: lsp.DocumentOnTypeFormattingParams = {
          textDocument: this.toTextDocument(model),
          position: this.toLspPosition(position),
          ch,
          options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces },
        };
        console.log('[OnTypeFormattingProvider] Sending textDocument/onTypeFormatting for', params.textDocument.uri);
        try {
          const result = await this.request<lsp.TextEdit[]>('textDocument/onTypeFormatting', params);
          console.log('[OnTypeFormattingProvider] Got on-type formatting edits:', result?.length ?? 0, 'edits');
          return result ? this.fromLspTextEdits(result) : null;
        } catch (err) {
          console.error('OnTypeFormattingProvider error:', err);
          return null;
        }
      },
    };
    this.disposables.push(monacoApi.languages.registerOnTypeFormattingEditProvider(this.selector, provider));
  }
}
