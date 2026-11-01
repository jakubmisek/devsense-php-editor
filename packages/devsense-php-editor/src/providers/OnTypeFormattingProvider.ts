/**
 * OnTypeFormattingProvider — maps Monaco OnTypeFormattingEditProvider to devsense-php-ls
 * LSP request textDocument/onTypeFormatting.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';

export interface OnTypeFormattingProviderOptions {
  selector: any;
  languageId: string;
  autoFormatTriggerCharacters: string[];
}

export class OnTypeFormattingProvider extends BaseProvider {
  private readonly autoFormatTriggerCharacters: string[];

  constructor(router: any, options: OnTypeFormattingProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
    this.autoFormatTriggerCharacters = options.autoFormatTriggerCharacters ?? ['}', ')', ';'];
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      autoFormatTriggerCharacters: this.autoFormatTriggerCharacters,
      provideOnTypeFormattingEdits: async (model: any, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): Promise<ProviderResult<TextEdit[]>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          ch,
          options: {
            tabSize: options.tabSize,
            insertSpaces: options.insertSpaces,
          },
        };
        try {
          const result = await this.router.sendRequest('textDocument/onTypeFormatting', params);
          if (!result || !Array.isArray(result)) return null;
          return result.map((e: any) => ({
            range: this.fromLspRange(e.range),
            text: e.text,
          }));
        } catch (err) {
          console.error('OnTypeFormattingProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerOnTypeFormattingEditProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
