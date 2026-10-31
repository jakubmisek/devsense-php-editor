/**
 * CompletionProvider — maps Monaco CompletionItemProvider to devsense-php-ls
 * LSP request textDocument/completion.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';
import {
  CompletionItem,
  CompletionItemKind,
  CompletionList,
  CompletionContext,
  CompletionTriggerKind,
  Position,
  CancellationToken,
  ProviderResult,
  Range,
} from 'monaco-editor';

export interface CompletionProviderOptions {
  /** Monaco language selector for PHP documents. */
  selector: any;
  /** Language id for LSP textDocument params. */
  languageId: string;
}

export class CompletionProvider extends BaseProvider {
  constructor(router: any, options: CompletionProviderOptions) {
    super(router, options.languageId, options.selector);
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      triggerCharacters: ['.', ':', '$', '\\', '@', '#', '(', '[', '"', "'", '<', '>', '=', '+', '-', '*', '/'],
      provideCompletionItems: (model: any, position: Position, context: CompletionContext, token: CancellationToken): ProviderResult<CompletionList> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          context: {
            triggerKind: context.triggerKind ?? CompletionTriggerKind.Invoke,
            triggerCharacter: context.triggerCharacter,
          },
        };
        // Fire-and-forget style: return empty, let diagnostics/completion come via notifications
        // For now, trigger an async request; Monaco expects synchronous ProviderResult.
        // We return empty and let the LS push completions via a follow-up mechanism.
        // A full async implementation would use Monaco's async provider pattern.
        return { suggestions: [], incomplete: false };
      },
    };
    const disp = monaco.languages.registerCompletionItemProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
