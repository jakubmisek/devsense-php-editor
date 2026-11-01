/**
 * InlayHintsProvider — maps Monaco InlayHintsProvider to devsense-php-ls
 * LSP request textDocument/inlayHint.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface InlayHintsProviderOptions {
  selector: any;
  languageId: string;
  monaco: any;
}

export class InlayHintsProvider extends BaseProvider {
  constructor(router: any, options: InlayHintsProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      provideInlayHints: async (model: any, range: any, token: CancellationToken): Promise<ProviderResult<InlayHintList>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          range: this.toLspRange(range),
        };
        console.log('[InlayHintsProvider] Sending textDocument/inlayHint for', params.textDocument.uri);
        try {
          const result = await this.router.sendRequest('textDocument/inlayHint', params);
          console.log('[InlayHintsProvider] Got inlay hints:', result?.length ?? 0, 'hints');
          if (!result || !Array.isArray(result)) return null;
          return {
            hints: result.map((h: any) => ({
              label: h.label,
              tooltip: h.tooltip,
              textEdits: h.textEdits ? h.textEdits.map((e: any) => ({
                range: this.fromLspRange(e.range),
                text: e.newText,
              })) : undefined,
              position: this.fromLspPosition(h.position),
              kind: h.kind === 1 ? this.monaco.InlayHintKind.Type : this.monaco.InlayHintKind.Parameter,
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
