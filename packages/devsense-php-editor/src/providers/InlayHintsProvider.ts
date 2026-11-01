/**
 * InlayHintsProvider — maps Monaco InlayHintsProvider to devsense-php-ls LSP request textDocument/inlayHint.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export type InlayHintsProviderOptions = BaseProviderOptions;

export class InlayHintsProvider extends BaseProvider {
  constructor(router: LspRequestSender, options: InlayHintsProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.InlayHintsProvider = {
      provideInlayHints: async (model, range, _token) => {
        const params: lsp.InlayHintParams = { textDocument: this.toTextDocument(model), range: this.toLspRange(range) };
        console.log('[InlayHintsProvider] Sending textDocument/inlayHint for', params.textDocument.uri);
        try {
          const result = await this.request<lsp.InlayHint[]>('textDocument/inlayHint', params);
          console.log('[InlayHintsProvider] Got inlay hints:', result?.length ?? 0, 'hints');
          if (!result) return null;
          return { hints: result.map((h) => this.fromLspInlayHint(h)), dispose: () => { /* no-op */ } };
        } catch (err) {
          console.error('InlayHintsProvider error:', err);
          return null;
        }
      },
    };
    this.disposables.push(monacoApi.languages.registerInlayHintsProvider(this.selector, provider));
  }

  private fromLspInlayHint(h: lsp.InlayHint): monaco.languages.InlayHint {
    const label = typeof h.label === 'string'
      ? h.label
      : h.label.map((p): monaco.languages.InlayHintLabelPart => ({
          label: p.value,
          tooltip: this.fromLspMarkup(p.tooltip),
          command: this.fromLspCommand(p.command),
          location: p.location ? this.fromLspLocation(p.location) : undefined,
        }));
    const K = this.monaco.languages.InlayHintKind;
    return {
      label,
      tooltip: this.fromLspMarkup(h.tooltip),
      textEdits: h.textEdits ? this.fromLspTextEdits(h.textEdits) : undefined,
      position: this.fromLspPosition(h.position),
      // LSP and Monaco InlayHintKind share values (Type=1, Parameter=2).
      kind: h.kind === 1 ? K.Type : h.kind === 2 ? K.Parameter : undefined,
      paddingLeft: h.paddingLeft,
      paddingRight: h.paddingRight,
    };
  }
}
