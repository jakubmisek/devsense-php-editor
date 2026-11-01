/**
 * InlineCompletionProvider — maps Monaco InlineCompletionsProvider to devsense-php-ls LSP request textDocument/inlineCompletion.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export type InlineCompletionProviderOptions = BaseProviderOptions;

export class InlineCompletionProvider extends BaseProvider {
  constructor(router: LspRequestSender, options: InlineCompletionProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.InlineCompletionsProvider = {
      provideInlineCompletions: async (model, position, context, _token) => {
        const selected = context.selectedSuggestionInfo;
        const params: lsp.InlineCompletionParams = {
          textDocument: this.toTextDocument(model),
          position: this.toLspPosition(position),
          // Monaco InlineCompletionTriggerKind: Automatic=0, Explicit=1.
          // LSP 3.18 InlineCompletionTriggerKind: Invoked=1, Automatic=2. (vscode-languageserver-protocol
          // 3.17.x still types the proposed 0/1 values, hence the cast.)
          context: {
            triggerKind: (context.triggerKind === this.monaco.languages.InlineCompletionTriggerKind.Explicit ? 1 : 2) as number as lsp.InlineCompletionTriggerKind,
            selectedCompletionInfo: selected ? { range: this.toLspRange(selected.range), text: selected.text } : undefined,
          },
        };
        console.log('[InlineCompletionProvider] Sending textDocument/inlineCompletion for', params.textDocument.uri);
        try {
          const result = await this.request<lsp.InlineCompletionList | lsp.InlineCompletionItem[]>('textDocument/inlineCompletion', params);
          // LSP allows InlineCompletionList or InlineCompletionItem[].
          const items = Array.isArray(result) ? result : result?.items ?? [];
          console.log('[InlineCompletionProvider] Got inline completions:', items.length, 'items');
          return {
            items: items.map((item): monaco.languages.InlineCompletion => ({
              insertText: typeof item.insertText === 'string' ? item.insertText : { snippet: item.insertText.value },
              range: item.range ? this.fromLspRange(item.range) : undefined,
              command: this.fromLspCommand(item.command),
            })),
          };
        } catch (err) {
          console.error('InlineCompletionProvider error:', err);
          return null;
        }
      },
      disposeInlineCompletions: () => { /* nothing to free */ },
    };
    this.disposables.push(monacoApi.languages.registerInlineCompletionsProvider(this.selector, provider));
  }
}
