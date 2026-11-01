/**
 * CodeLensProvider — maps Monaco CodeLensProvider to devsense-php-ls LSP request textDocument/codeLens and codeLens/resolve.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export type CodeLensProviderOptions = BaseProviderOptions;

/** Monaco lens that remembers the LSP lens it came from, for codeLens/resolve. */
interface LspBackedCodeLens extends monaco.languages.CodeLens {
  lsp: lsp.CodeLens;
}

export class CodeLensProvider extends BaseProvider {
  constructor(router: LspRequestSender, options: CodeLensProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.CodeLensProvider = {
      provideCodeLenses: async (model, _token) => {
        const params: lsp.CodeLensParams = { textDocument: this.toTextDocument(model) };
        console.log('[CodeLensProvider] Sending textDocument/codeLens for', params.textDocument.uri);
        try {
          const result = await this.request<lsp.CodeLens[]>('textDocument/codeLens', params);
          console.log('[CodeLensProvider] Got code lenses:', result?.length ?? 0, 'lenses');
          if (!result) return null;
          const lenses = result.map((l): LspBackedCodeLens => ({ range: this.fromLspRange(l.range), command: this.fromLspCommand(l.command), lsp: l }));
          return { lenses, dispose: () => { /* no-op */ } };
        } catch (err) {
          console.error('CodeLensProvider error:', err);
          return null;
        }
      },
      resolveCodeLens: async (_model, codeLens, _token) => {
        const lens = codeLens as LspBackedCodeLens;
        if (lens.command || !lens.lsp) return lens;
        try {
          const resolved = await this.request<lsp.CodeLens>('codeLens/resolve', lens.lsp);
          if (resolved?.command) lens.command = this.fromLspCommand(resolved.command);
        } catch (err) {
          console.error('CodeLensProvider resolve error:', err);
        }
        return lens;
      },
    };
    this.disposables.push(monacoApi.languages.registerCodeLensProvider(this.selector, provider));
  }
}
