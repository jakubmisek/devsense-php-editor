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

// LSP CompletionItemKind (1-based) -> Monaco languages.CompletionItemKind.
const LSP_TO_MONACO_KIND: Record<number, number> = {
  1: 18, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 7, 9: 8, 10: 9, 11: 12, 12: 13, 13: 15,
  14: 17, 15: 27, 16: 19, 17: 20, 18: 21, 19: 23, 20: 16, 21: 14, 22: 6, 23: 10, 24: 11, 25: 24,
};

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
            triggerKind: (context.triggerKind ?? 0) + 1, // Monaco 0-based -> LSP 1-based
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
          const defaults: any = result.itemDefaults || {};
          const toRange = (r: any): any => (r && r.start ? this.fromLspRange(r)
            : r && r.insert ? { insert: this.fromLspRange(r.insert), replace: this.fromLspRange(r.replace) } : undefined);
          const suggestions = result.items.map((item: any) => {
            const edit = item.textEdit;
            const insertTextFormat = item.insertTextFormat ?? defaults.insertTextFormat;
            return {
              label: item.label,
              kind: LSP_TO_MONACO_KIND[item.kind] ?? 18,
              detail: item.detail,
              documentation: item.documentation,
              insertText: edit?.newText ?? item.insertText ?? item.textEditText ?? item.label,
              insertTextRules: insertTextFormat === 2 ? 4 /* InsertAsSnippet */ : undefined,
              range: toRange(edit?.range ?? edit ?? defaults.editRange),
              sortText: item.sortText,
              filterText: item.filterText,
              preselect: item.preselect,
              commitCharacters: item.commitCharacters ?? defaults.commitCharacters,
              additionalTextEdits: item.additionalTextEdits?.map((e: any) => ({ range: this.fromLspRange(e.range), text: e.newText })),
              command: item.command,
            };
          });
          return { suggestions, incomplete: result.isIncomplete ?? false };
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
