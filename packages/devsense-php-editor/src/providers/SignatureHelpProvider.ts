/**
 * SignatureHelpProvider — maps Monaco SignatureHelpProvider to devsense-php-ls
 * LSP request textDocument/signatureHelp.
 */
import { BaseProvider } from './base';
import { MonacoLanguageApi } from './base';
import { SignatureHelpResult, SignatureHelp, SignatureInformation, ParameterInformation, Position, CancellationToken, ProviderResult } from 'monaco-editor';

export interface SignatureHelpProviderOptions {
  selector: any;
  languageId: string;
  triggerCharacters?: string[];
  retriggerCharacters?: string[];
}

export class SignatureHelpProvider extends BaseProvider {
  private readonly triggerCharacters: string[];
  private readonly retriggerCharacters: string[];

  constructor(router: any, options: SignatureHelpProviderOptions) {
    super(router, options.languageId, options.selector);
    this.triggerCharacters = options.triggerCharacters ?? ['(', ',', '<'];
    this.retriggerCharacters = options.retriggerCharacters ?? [',', ')'];
  }

  register(monaco: MonacoLanguageApi): void {
    const provider = {
      signatureHelpTriggerCharacters: this.triggerCharacters,
      signatureHelpRetriggerCharacters: this.retriggerCharacters,
      provideSignatureHelp: async (model: any, position: Position, token: CancellationToken, context: any): Promise<ProviderResult<SignatureHelpResult>> => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          context: {
            triggerKind: context.triggerKind,
            triggerCharacter: context.triggerCharacter,
            isRetrigger: context.isRetrigger,
            activeSignatureHelp: context.activeSignatureHelp,
          },
        };
        try {
          const result = await this.router.sendRequest('textDocument/signatureHelp', params);
          if (!result || !result.signatures || result.signatures.length === 0) return null;
          const signatures: SignatureInformation[] = result.signatures.map((s: any) => ({
            label: s.label,
            documentation: s.documentation,
            parameters: (s.parameters || []).map((p: any) => ({
              label: typeof p.label === 'string' ? p.label : [p.label[0], p.label[1]],
              documentation: p.documentation,
            })),
            activeParameter: s.activeParameter,
          }));
          return {
            value: {
              signatures,
              activeSignature: result.activeSignature ?? 0,
              activeParameter: result.activeParameter ?? 0,
            },
            dispose: () => { /* no-op */ },
          };
        } catch (err) {
          console.error('SignatureHelpProvider error:', err);
          return null;
        }
      },
    };
    const disp = monaco.languages.registerSignatureHelpProvider(this.selector, provider);
    this.disposables.push(disp);
  }
}
