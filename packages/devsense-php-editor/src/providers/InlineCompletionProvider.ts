/**
 * InlineCompletionProvider — maps Monaco InlineCompletionsProvider to devsense-php-ls
 * LSP request textDocument/inlineCompletion.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface InlineCompletionProviderOptions {
  selector: any;
  languageId: string;
  monaco: any;
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
          // Monaco InlineCompletionTriggerKind: Automatic=0, Explicit=1.
          // LSP InlineCompletionTriggerKind:    Invoked=1,   Automatic=2.
          context: {
            triggerKind: (context as any)?.triggerKind === 1 ? 1 : 2,
            selectedCompletionInfo: (context as any)?.selectedSuggestionInfo
              ? { range: this.toLspRange((context as any).selectedSuggestionInfo.range), text: (context as any).selectedSuggestionInfo.text }
              : undefined,
          },
        };
        console.log('[InlineCompletionProvider] Sending textDocument/inlineCompletion for', params.textDocument.uri);
        try {
          const result = await this.router.sendRequest('textDocument/inlineCompletion', params);
          console.log('[InlineCompletionProvider] Got inline completions:', result?.items?.length ?? 0, 'items');
          // LSP allows InlineCompletionList or InlineCompletionItem[].
          const items = Array.isArray(result) ? result : result?.items;
          if (!items || !Array.isArray(items)) return { items: [] };
          return {
            items: items.map((item: any) => ({
              insertText: typeof item.insertText === 'string' ? item.insertText : { snippet: item.insertText?.value ?? '' },
              filterText: item.filterText,
              range: item.range ? this.fromLspRange(item.range) : undefined,
              command: item.command,
            })),
          };
        } catch (err) {
          console.error('InlineCompletionProvider error:', err);
          return null;
        }
      },
      // Required by Monaco's InlineCompletionsProvider interface.
      disposeInlineCompletions: () => { /* nothing to free */ },
      freeInlineCompletions: () => { /* older Monaco name */ },
    };
    const disp = monaco.languages.registerInlineCompletionsProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
