/**
 * SignatureHelpProvider — maps Monaco SignatureHelpProvider to devsense-php-ls LSP request textDocument/signatureHelp.
 */
import type * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { BaseProvider, BaseProviderOptions, LspRequestSender, MonacoApi } from './base';

export interface SignatureHelpProviderOptions extends BaseProviderOptions {
  triggerCharacters?: string[];
  retriggerCharacters?: string[];
}

export class SignatureHelpProvider extends BaseProvider {
  private readonly triggerCharacters: string[];
  private readonly retriggerCharacters: string[];

  constructor(router: LspRequestSender, options: SignatureHelpProviderOptions) {
    super(router, options.languageId, options.selector, options.monaco);
    this.triggerCharacters = options.triggerCharacters ?? ['(', ',', '<'];
    this.retriggerCharacters = options.retriggerCharacters ?? [',', ')'];
  }

  register(monacoApi: MonacoApi): void {
    const provider: monaco.languages.SignatureHelpProvider = {
      signatureHelpTriggerCharacters: this.triggerCharacters,
      signatureHelpRetriggerCharacters: this.retriggerCharacters,
      provideSignatureHelp: async (model, position, _token, context) => {
        const active = context.activeSignatureHelp;
        const params: lsp.SignatureHelpParams = {
          textDocument: this.toTextDocument(model),
          position: this.toLspPosition(position),
          context: {
            // Monaco and LSP SignatureHelpTriggerKind share values (Invoke=1, TriggerCharacter=2, ContentChange=3).
            triggerKind: context.triggerKind as number as lsp.SignatureHelpTriggerKind,
            triggerCharacter: context.triggerCharacter,
            isRetrigger: context.isRetrigger,
            activeSignatureHelp: active
              ? {
                  signatures: active.signatures.map((s) => ({ label: s.label, parameters: s.parameters.map((p) => ({ label: p.label })) })),
                  activeSignature: active.activeSignature,
                  activeParameter: active.activeParameter,
                }
              : undefined,
          },
        };
        console.log('[SignatureHelpProvider] Sending textDocument/signatureHelp for', params.textDocument.uri);
        try {
          const result = await this.request<lsp.SignatureHelp>('textDocument/signatureHelp', params);
          console.log('[SignatureHelpProvider] Got signature help:', !!result?.signatures?.length);
          if (!result?.signatures?.length) return null;
          const signatures = result.signatures.map((s): monaco.languages.SignatureInformation => ({
            label: s.label,
            documentation: this.fromLspMarkup(s.documentation),
            parameters: (s.parameters ?? []).map((p) => ({ label: p.label, documentation: this.fromLspMarkup(p.documentation) })),
            activeParameter: s.activeParameter ?? undefined,
          }));
          return {
            value: { signatures, activeSignature: result.activeSignature ?? 0, activeParameter: result.activeParameter ?? 0 },
            dispose: () => { /* no-op */ },
          };
        } catch (err) {
          console.error('SignatureHelpProvider error:', err);
          return null;
        }
      },
    };
    this.disposables.push(monacoApi.languages.registerSignatureHelpProvider(this.selector, provider));
  }
}
