/**
 * CompletionProvider — maps Monaco CompletionItemProvider to devsense-php-ls LSP request textDocument/completion.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export type CompletionProviderOptions = BaseProviderOptions;

// LSP CompletionItemKind (1-based) -> Monaco languages.CompletionItemKind value.
const LSP_TO_MONACO_KIND: Record<number, number> = {
  1: 18, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 7, 9: 8, 10: 9, 11: 12, 12: 13, 13: 15,
  14: 17, 15: 27, 16: 19, 17: 20, 18: 21, 19: 23, 20: 16, 21: 14, 22: 6, 23: 10, 24: 11, 25: 24,
};

type LspEditRange = lsp.Range | { insert: lsp.Range; replace: lsp.Range };

export class CompletionProvider extends BaseProvider {
  constructor(router: LspRequestSender, options: CompletionProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.CompletionItemProvider = {
      triggerCharacters: ['.', ':', '$', '\\', '@', '#', '(', '[', '"', "'", '<', '>', '=', '+', '-', '*', '/'],
      provideCompletionItems: async (model, position, context, _token) => {
        const params: lsp.CompletionParams = {
          textDocument: this.toTextDocument(model),
          position: this.toLspPosition(position),
          context: {
            // Monaco CompletionTriggerKind is 0-based, LSP is 1-based.
            triggerKind: ((context.triggerKind ?? 0) + 1) as lsp.CompletionTriggerKind,
            triggerCharacter: context.triggerCharacter,
          },
        };
        console.log('[CompletionProvider] Sending textDocument/completion for', params.textDocument.uri, 'at line', position.lineNumber, 'col', position.column);
        try {
          const result = await this.request<lsp.CompletionList | lsp.CompletionItem[]>('textDocument/completion', params);
          const items = Array.isArray(result) ? result : result?.items;
          console.log('[CompletionProvider] Got completion result:', items?.length ?? 0, 'items');
          if (!items) return { suggestions: [], incomplete: false };
          const defaults = (!Array.isArray(result) && result?.itemDefaults) || {};
          const word = model.getWordUntilPosition(position);
          const wordRange = new this.monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
          const toRange = (r: LspEditRange | undefined): monaco.IRange | monaco.languages.CompletionItemRanges =>
            !r ? wordRange : 'start' in r ? this.fromLspRange(r) : { insert: this.fromLspRange(r.insert), replace: this.fromLspRange(r.replace) };
          const suggestions = items.map((item): monaco.languages.CompletionItem => {
            const edit = item.textEdit;
            const insertTextFormat = item.insertTextFormat ?? defaults.insertTextFormat;
            const editRange: LspEditRange | undefined = edit ? ('range' in edit ? edit.range : edit) : defaults.editRange;
            return {
              label: item.label,
              kind: (LSP_TO_MONACO_KIND[item.kind ?? 1] ?? 18) as monaco.languages.CompletionItemKind,
              detail: item.detail,
              documentation: this.fromLspMarkup(item.documentation),
              insertText: edit?.newText ?? item.insertText ?? item.textEditText ?? item.label,
              insertTextRules: insertTextFormat === 2 ? this.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
              range: toRange(editRange),
              sortText: item.sortText,
              filterText: item.filterText,
              preselect: item.preselect,
              commitCharacters: item.commitCharacters ?? defaults.commitCharacters,
              additionalTextEdits: this.fromLspTextEdits(item.additionalTextEdits),
              command: this.fromLspCommand(item.command),
            };
          });
          return { suggestions, incomplete: !Array.isArray(result) && (result?.isIncomplete ?? false) };
        } catch (err) {
          console.error('[CompletionProvider] Error:', err);
          return { suggestions: [], incomplete: false };
        }
      },
    };
    this.disposables.push(monacoApi.languages.registerCompletionItemProvider(this.selector, provider));
  }
}
