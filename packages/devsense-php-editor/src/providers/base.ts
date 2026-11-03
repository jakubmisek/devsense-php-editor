/**
 * Base provider for LSP-backed Monaco language features.
 *
 * Each provider maps a Monaco provider interface to a devsense-php-ls LSP request
 * sent through an {@link LspRequestSender} (the Node Router or the browser WsClient).
 *
 * Types come from `monaco-editor` and `vscode-languageserver-protocol` as type-only
 * imports; nothing from either package is bundled. The Monaco runtime API is injected
 * through the constructor (`options.monaco`), so enums/classes such as
 * `monaco.Range` or `monaco.languages.SymbolKind` are read from that object.
 */
import type * as monaco from 'monaco-editor';
import * as lsp from 'vscode-languageserver-protocol';

/** The `monaco-editor` namespace object (what `import * as monaco from 'monaco-editor'` yields). */
export type MonacoApi = typeof monaco;
/** @deprecated kept for backward compatibility; use {@link MonacoApi}. */
export type MonacoLanguageApi = MonacoApi;

/** Anything that can send an LSP request and resolve with its result (Router, WsClient). */
export interface LspRequestSender {
  sendRequest(method: string, params?: unknown): Promise<unknown>;
}

/** Options shared by every provider. */
export interface BaseProviderOptions {
  selector: monaco.languages.LanguageSelector;
  languageId: string;
  monaco: MonacoApi;
}

export abstract class BaseProvider {
  protected readonly router: LspRequestSender;
  protected readonly languageId: string;
  protected readonly selector: monaco.languages.LanguageSelector;
  protected readonly monaco: MonacoApi;
  protected disposables: monaco.IDisposable[] = [];

  constructor(router: LspRequestSender, languageId: string, selector: monaco.languages.LanguageSelector, monacoApi: MonacoApi) {
    this.router = router;
    this.languageId = languageId;
    this.selector = selector;
    this.monaco = monacoApi;
  }

  /** Register the provider with Monaco. */
  abstract register(monacoApi: MonacoApi): void;

  /** Send an LSP request; the result type is the LSP response type for `method`. */
  protected async request<R>(method: string, params: object): Promise<R | null> {
    return ((await this.router.sendRequest(method, params)) ?? null) as R | null;
  }

  protected toTextDocument(model: monaco.editor.ITextModel): lsp.TextDocumentIdentifier {
    return { uri: model.uri.toString() };
  }

  /** Monaco position (1-based) -> LSP position (0-based). */
  protected toLspPosition(pos: monaco.IPosition): lsp.Position {
    return { line: pos.lineNumber - 1, character: pos.column - 1 };
  }

  /** LSP position -> Monaco Position. */
  protected fromLspPosition(pos: lsp.Position): monaco.Position {
    return new this.monaco.Position(pos.line + 1, pos.character + 1);
  }

  /** Monaco range -> LSP range. */
  protected toLspRange(range: monaco.IRange): lsp.Range {
    return {
      start: this.toLspPosition({ lineNumber: range.startLineNumber, column: range.startColumn }),
      end: this.toLspPosition({ lineNumber: range.endLineNumber, column: range.endColumn }),
    };
  }

  /** LSP range -> Monaco Range. */
  protected fromLspRange(range: lsp.Range): monaco.Range {
    return new this.monaco.Range(range.start.line + 1, range.start.character + 1, range.end.line + 1, range.end.character + 1);
  }

  /** LSP Location or LocationLink -> Monaco Location. */
  protected fromLspLocation(loc: lsp.Location | lsp.LocationLink): monaco.languages.Location {
    if ('targetUri' in loc) {
      return { uri: this.monaco.Uri.parse(loc.targetUri), range: this.fromLspRange(loc.targetSelectionRange ?? loc.targetRange) };
    }
    return { uri: this.monaco.Uri.parse(loc.uri), range: this.fromLspRange(loc.range) };
  }

  protected fromLspTextEdits(edits: lsp.TextEdit[] | null | undefined): monaco.languages.TextEdit[] {
    return (edits ?? []).map((e) => ({ range: this.fromLspRange(e.range), text: e.newText }));
  }

  /** LSP MarkupContent / MarkedString(s) -> Monaco markdown. */
  protected fromLspMarkup(doc: string | lsp.MarkupContent | lsp.MarkedString | undefined): string | monaco.IMarkdownString | undefined {
    if (doc === undefined || typeof doc === 'string') return doc;
    if ('kind' in doc) return doc.kind === 'markdown' ? { value: doc.value } : doc.value;
    return { value: '```' + doc.language + '\n' + doc.value + '\n```' };
  }

  protected fromLspCommand(cmd: lsp.Command | undefined): monaco.languages.Command | undefined {
    return cmd ? { id: cmd.command, title: cmd.title, arguments: cmd.arguments } : undefined;
  }

  /** LSP WorkspaceEdit -> Monaco WorkspaceEdit (text edits only; file operations are ignored). */
  protected fromLspWorkspaceEdit(edit: lsp.WorkspaceEdit | null | undefined): monaco.languages.WorkspaceEdit | undefined {
    if (!edit) return undefined;
    const edits: monaco.languages.IWorkspaceTextEdit[] = [];
    const push = (uri: string, e: lsp.TextEdit | lsp.AnnotatedTextEdit | lsp.SnippetTextEdit) =>
      edits.push(
        {
          resource: this.monaco.Uri.parse(uri),
          textEdit: {
            range: this.fromLspRange(e.range),
            insertAsSnippet: lsp.SnippetTextEdit.is(e),
            text: lsp.SnippetTextEdit.is(e) ? e.snippet.value : e.newText
          },
          versionId: undefined
        });
    for (const [uri, list] of Object.entries(edit.changes ?? {})) for (const e of list) push(uri, e);
    for (const dc of edit.documentChanges ?? []) {
      if ('edits' in dc) for (const e of dc.edits) push(dc.textDocument.uri, e);
    }
    return { edits };
  }

  /** Dispose all registered Monaco providers. */
  dispose(): void {
    for (const d of this.disposables) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    this.disposables = [];
  }
}
