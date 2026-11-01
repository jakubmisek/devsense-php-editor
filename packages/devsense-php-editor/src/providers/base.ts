/**
 * Base provider for LSP-backed Monaco language features.
 *
 * Each provider wraps an LSP request method and maps between Monaco Editor
 * provider interfaces and devsense-php-ls LSP requests/responses through
 * the Router (which exposes promise-based sendRequest).
 *
 * Monaco is injected via the constructor. The actual Monaco object comes
 * from window.monaco (loaded via AMD loader), not from importing 'monaco-editor'
 * at build time (which breaks because monaco-editor's ESM doesn't export types).
 */
import { Router } from '../server/Router';

export interface MonacoLanguageApi {
  registerCompletionItemProvider(selector: any, provider: any): { dispose(): void };
  registerHoverProvider(selector: any, provider: any): { dispose(): void };
  registerSignatureHelpProvider(selector: any, provider: any): { dispose(): void };
  registerDefinitionProvider(selector: any, provider: any): { dispose(): void };
  registerReferenceProvider(selector: any, provider: any): { dispose(): void };
  registerDocumentSymbolProvider(selector: any, provider: any): { dispose(): void };
  registerCodeActionProvider?(selector: any, provider: any): { dispose(): void };
  registerDocumentFormattingEditProvider?(selector: any, provider: any): { dispose(): void };
  registerDocumentRangeFormattingEditProvider?(selector: any, provider: any): { dispose(): void };
  registerOnTypeFormattingEditProvider?(selector: any, provider: any): { dispose(): void };
  registerDocumentSemanticTokensProvider?(selector: any, provider: any): { dispose(): void };
  registerInlineCompletionsProvider?(selector: any, provider: any): { dispose(): void };
  registerInlayHintsProvider?(selector: any, provider: any): { dispose(): void };
  registerCodeLensProvider?(selector: any, provider: any): { dispose(): void };
  registerRenameProvider?(selector: any, provider: any): { dispose(): void };
}

export abstract class BaseProvider {
  protected readonly router: Router;
  protected readonly languageId: string;
  protected readonly selector: any;
  protected disposables: Array<{ dispose(): void }> = [];
  protected readonly monaco: any;

  constructor(router: Router, languageId: string, selector: any, monaco: any) {
    this.router = router;
    this.languageId = languageId;
    this.selector = selector;
    this.monaco = monaco;
  }

  /**
   * Send an LSP request to devsense-php-ls and await the response.
   */
  protected async request(method: string, params: any): Promise<any> {
    return this.router.sendRequest(method, params);
  }

  /** Convert a Monaco Position to LSP position { line, character }. */
  protected toLspPosition(pos: { lineNumber: number; column: number }): { line: number; character: number } {
    return { line: pos.lineNumber - 1, character: pos.column - 1 };
  }

  /** Convert an LSP position { line, character } to Monaco Position. */
  protected fromLspPosition(pos: { line: number; character: number }): any {
    return new this.monaco.Position(pos.line + 1, pos.character + 1);
  }

  /** Convert an LSP range to LSP range { start, end }. */
  protected toLspRange(range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }): { start: { line: number; character: number }; end: { line: number; character: number } } {
    return {
      start: this.toLspPosition({ lineNumber: range.startLineNumber, column: range.startColumn }),
      end: this.toLspPosition({ lineNumber: range.endLineNumber, column: range.endColumn }),
    };
  }

  /** Convert an LSP range to Monaco Range. */
  protected fromLspRange(range: { start: { line: number; character: number }; end: { line: number; character: number } }): any {
    return new this.monaco.Range(
      range.start.line + 1,
      range.start.character + 1,
      range.end.line + 1,
      range.end.character + 1
    );
  }

  /** Convert an LSP Location to Monaco Location. */
  protected fromLspLocation(loc: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }): any {
    return { uri: loc.uri, range: this.fromLspRange(loc.range) };
  }

  /** Register the Monaco provider and track its disposable. */
  protected register(monaco: MonacoLanguageApi, registerFn: (monaco: MonacoLanguageApi) => { dispose(): void }): void {
    const disp = registerFn(monaco);
    this.disposables.push(disp);
  }

  /** Dispose all registered Monaco providers. */
  dispose(): void {
    for (const d of this.disposables) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    this.disposables = [];
  }
}
