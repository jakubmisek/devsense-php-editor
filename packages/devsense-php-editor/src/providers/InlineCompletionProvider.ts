/**
 * InlineCompletionProvider — maps Monaco InlineCompletionsProvider to devsense-php-ls
 * LSP request textDocument/inlineCompletion.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface InlineCompletionProviderOptions {
  selector: any;
  languageId: string;
}

export class InlineCompletionProvider extends BaseProvider {
  constructor(router: any, options: InlineCompletionProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      provideInlineCompletions: async (model: any, position: Position, context: InlineCompletionContext, token: CancellationToken): Promise<ProviderResult<InlineCompletions>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
        };
        try {
          const result = await this.router.sendRequest('textDocument/inlineCompletion', params);
          if (!result || !result.items || !Array.isArray(result.items)) return null;
          return {
            items: result.items.map((item: any) => ({
              insertText: item.insertText,
              range: item.range ? this.fromLspRange(item.range) : undefined,
              command: item.command,
            })),
            commands: [],
          };
        } catch (err) {
          console.error('InlineCompletionProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerInlineCompletionsProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
