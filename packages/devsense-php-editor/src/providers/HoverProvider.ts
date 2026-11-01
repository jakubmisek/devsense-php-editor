/**
 * HoverProvider — maps Monaco HoverProvider to devsense-php-ls
 * LSP request textDocument/hover.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface HoverProviderOptions {
  selector: any;
  languageId: string;
  monaco: any;
}

export class HoverProvider extends BaseProvider {
  constructor(router: any, options: HoverProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      provideHover: async (model: any, position: Position, token: CancellationToken): Promise<ProviderResult<Hover>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
        };
        console.log('[HoverProvider] Sending textDocument/hover for', params.textDocument.uri);
        try {
          const result = await this.router.sendRequest('textDocument/hover', params);
          console.log('[HoverProvider] Got hover result:', !!result?.contents);
          if (!result || !result.contents) return null;
          const contents = Array.isArray(result.contents) ? result.contents : [result.contents];
          const markdownContents = contents.map((c: any) => {
            if (typeof c === 'string') return { value: c, kind: 'markdown' as const } as IMarkdownString;
            if (c.kind && c.value) return c as IMarkdownString;
            return { value: String(c), kind: 'markdown' as const } as IMarkdownString;
          });
          return {
            contents: markdownContents,
            range: result.range ? this.fromLspRange(result.range) : undefined,
          };
        } catch (err) {
          console.error('HoverProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerHoverProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
