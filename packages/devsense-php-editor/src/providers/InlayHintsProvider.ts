/**
 * InlayHintsProvider — maps Monaco InlayHintsProvider to devsense-php-ls
 * LSP request textDocument/inlayHint.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';
import { InlayHintList, InlayHint, InlayHintKind, Position, CancellationToken, ProviderResult, Range, TextEdit, Location } from 'monaco-editor';

export interface InlayHintsProviderOptions {
  selector: any;
  languageId: string;
}

export class InlayHintsProvider extends BaseProvider {
  constructor(router: any, options: InlayHintsProviderOptions) {
    super(router, options.languageId, options.selector);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      provideInlayHints: async (model: any, range: Range, token: CancellationToken): Promise<ProviderResult<InlayHintList>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          range: this.toLspRange(range),
        };
        try {
          const result = await this.router.sendRequest('textDocument/inlayHint', params);
          if (!result || !Array.isArray(result)) return null;
          return {
            hints: result.map((h: any) => ({
              label: h.label,
              tooltip: h.tooltip,
              textEdits: h.textEdits ? h.textEdits.map((e: any) => ({
                range: this.fromLspRange(e.range),
                text: e.text,
              })) : undefined,
              position: this.fromLspPosition(h.position),
              kind: h.kind === 1 ? InlayHintKind.Type : InlayHintKind.Parameter,
              paddingLeft: h.paddingLeft,
              paddingRight: h.paddingRight,
            })),
            dispose: () => { /* no-op */ },
          };
        } catch (err) {
          console.error('InlayHintsProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerInlayHintsProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
