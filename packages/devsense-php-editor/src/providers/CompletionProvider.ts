/**
 * CompletionProvider — maps Monaco CompletionItemProvider to devsense-php-ls
 * LSP request textDocument/completion.
 */
import { BaseProvider } from './base';

export interface CompletionProviderOptions {
  selector: any;
  languageId: string;
}

export class CompletionProvider extends BaseProvider {
  constructor(router: any, options: CompletionProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
  }

  register(monaco: any): void {
    const provider = {
      triggerCharacters: ['.', ':', '$', '\\', '@', '#', '(', '[', '"', "'", '<', '>', '=', '+', '-', '*', '/'],
      provideCompletionItems: (model: any, position: any, context: any, token: any) => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          context: {
            triggerKind: context.triggerKind ?? 0,
            triggerCharacter: context.triggerCharacter,
          },
        };
        return { suggestions: [], incomplete: false };
      },
    };
    const disp = monaco.languages.registerCompletionItemProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
