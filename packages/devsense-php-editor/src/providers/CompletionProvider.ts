/**
 * CompletionProvider — maps Monaco CompletionItemProvider to devsense-php-ls
 * LSP request textDocument/completion.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface CompletionProviderOptions {
  selector: any;
  languageId: string;
  monaco: any;
}

export class CompletionProvider extends BaseProvider {
  constructor(router: any, options: CompletionProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      triggerCharacters: ['.', ':', '$', '\\', '@', '#', '(', '[', '"', "'", '<', '>', '=', '+', '-', '*', '/'],
      provideCompletionItems: async (model: any, position: any, context: any, token: any) => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          context: {
            triggerKind: context.triggerKind ?? 0,
            triggerCharacter: context.triggerCharacter,
          },
        };
        console.log('[CompletionProvider] Sending textDocument/completion for', params.textDocument.uri, 'at line', position.lineNumber, 'col', position.column);
        try {
          const result = await this.router.sendRequest('textDocument/completion', params);
          console.log('[CompletionProvider] Got completion result:', result?.items?.length ?? 0, 'items');
          if (!result || !result.items || !Array.isArray(result.items)) {
            return { suggestions: [], incomplete: false };
          }
          const suggestions = result.items.map((item: any) => ({
            label: item.label,
            kind: item.kind ?? 18, // Text
            detail: item.detail,
            documentation: item.documentation,
            insertText: item.insertText ?? item.label,
            range: item.range ? this.fromLspRange(item.range) : undefined,
            sortText: item.sortText,
            filterText: item.filterText,
            commitCharacters: item.commitCharacters,
            additionalTextEdits: item.additionalTextEdits,
            command: item.command,
          }));
          return { suggestions, incomplete: result.incomplete ?? false };
        } catch (err) {
          console.error('[CompletionProvider] Error:', err);
          return { suggestions: [], incomplete: false };
        }
      },
    };
    const disp = monaco.languages.registerCompletionItemProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
