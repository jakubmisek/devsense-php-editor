/**
 * Browser-side PHP editor component.
 *
 * `createPhpEditor(container, options)` creates a Monaco editor, connects to the
 * server-side `PhpEditor` over WebSocket, performs the LSP client handshake, opens
 * the document in the client's `untitled-workspace-{id}://` sandbox, registers all
 * LSP-backed providers and turns `publishDiagnostics` into Monaco markers.
 */
import * as monaco from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import { ensureMonacoWorkers } from './workers';
import { LspWebSocketClient, type JsonRpcMessage } from './LspWebSocketClient';
import type { BaseProvider, MonacoApi } from '../providers/base';
import { CompletionProvider } from '../providers/CompletionProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { SignatureHelpProvider } from '../providers/SignatureHelpProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { DocumentSymbolProvider } from '../providers/DocumentSymbolProvider';
import { CodeActionProvider } from '../providers/CodeActionProvider';
import { FormattingProvider } from '../providers/FormattingProvider';
import { RangeFormattingProvider } from '../providers/RangeFormattingProvider';
import { OnTypeFormattingProvider } from '../providers/OnTypeFormattingProvider';
import { SemanticTokensProvider } from '../providers/SemanticTokensProvider';
import { InlineCompletionProvider } from '../providers/InlineCompletionProvider';
import { InlayHintsProvider } from '../providers/InlayHintsProvider';
import { CodeLensProvider } from '../providers/CodeLensProvider';
import { RenameProvider } from '../providers/RenameProvider';

/** Editor colour theme. `'auto'` follows `prefers-color-scheme`. */
export type PhpEditorTheme = 'light' | 'dark' | 'auto';

/** Connection state of the language server WebSocket. */
export type PhpEditorConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed';

/** A diagnostic for the editor's document (positions are 1-based, Monaco style). */
export interface PhpEditorDiagnostic {
  uri: string;
  message: string;
  /** LSP severity: 1 = Error, 2 = Warning, 3 = Information, 4 = Hint. */
  severity: lsp.DiagnosticSeverity;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  source?: string;
  code?: string;
}

export interface CreatePhpEditorOptions {
  /** WebSocket URL of the server-side `PhpEditor`, e.g. `ws://127.0.0.1:8765`. */
  serverUrl: string;
  /** Initial PHP source. */
  initialCode?: string;
  /** Initial theme. Default `'auto'`. */
  theme?: PhpEditorTheme;
  /** Document file name inside the client workspace. Default `'untitled.php'`. */
  documentName?: string;
  /** Extra Monaco editor options (merged over the defaults). */
  editorOptions?: monaco.editor.IStandaloneEditorConstructionOptions;
  /**
   * Install the default Monaco worker setup (`self.MonacoEnvironment`) unless the page
   * already defined one. Default `true`. Set `false` to manage workers yourself.
   */
  setupWorkers?: boolean;
  /** Extra `initializationOptions` sent with the client `initialize`. */
  initializationOptions?: Record<string, unknown>;
}

export interface PhpEditorInstance {
  /** The `monaco-editor` namespace used by this editor. */
  readonly monaco: MonacoApi;
  /** The underlying Monaco editor. */
  readonly editor: monaco.editor.IStandaloneCodeEditor;
  /** Resolves when the editor is connected, initialized and its providers are registered. Rejects if the connection fails. */
  readonly ready: Promise<void>;
  getValue(): string;
  setValue(code: string): void;
  setTheme(theme: PhpEditorTheme): void;
  getTheme(): PhpEditorTheme;
  /** URI of the document in the client's sandbox (empty until connected). */
  getDocumentUri(): string;
  getConnectionState(): PhpEditorConnectionState;
  /** Called with the full diagnostic list for the document every time the server publishes it. */
  onDiagnostics(listener: (diagnostics: PhpEditorDiagnostic[]) => void): monaco.IDisposable;
  onConnectionStateChange(listener: (state: PhpEditorConnectionState) => void): monaco.IDisposable;
  /** `window/showMessage` / `window/logMessage` from the language server. */
  onServerMessage(listener: (message: { type: lsp.MessageType; message: string }) => void): monaco.IDisposable;
  dispose(): void;
}

const LANGUAGE_ID = 'php';

const CLIENT_CAPABILITIES: lsp.ClientCapabilities = {
  textDocument: {
    completion: { dynamicRegistration: true },
    hover: { dynamicRegistration: true },
    signatureHelp: { dynamicRegistration: true },
    definition: { dynamicRegistration: true },
    references: { dynamicRegistration: true },
    documentSymbol: { dynamicRegistration: true },
    codeAction: { dynamicRegistration: true },
    formatting: { dynamicRegistration: true },
    rangeFormatting: { dynamicRegistration: true },
    semanticTokens: { dynamicRegistration: true, requests: { full: true }, tokenTypes: [], tokenModifiers: [], formats: ['relative'] },
    inlayHint: { dynamicRegistration: true },
    codeLens: { dynamicRegistration: true },
    rename: { dynamicRegistration: true },
  },
  workspace: { workspaceEdit: { documentChanges: true } },
};

function toMonacoSeverity(s: lsp.DiagnosticSeverity): monaco.MarkerSeverity {
  switch (s) {
    case 1: return monaco.MarkerSeverity.Error;
    case 2: return monaco.MarkerSeverity.Warning;
    case 3: return monaco.MarkerSeverity.Info;
    default: return monaco.MarkerSeverity.Hint;
  }
}

function resolveMonacoTheme(theme: PhpEditorTheme): string {
  const dark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return dark ? 'vs-dark' : 'vs';
}

class Emitter<T> {
  private listeners: Array<(value: T) => void> = [];
  on(listener: (value: T) => void): monaco.IDisposable {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter((l) => l !== listener); } };
  }
  fire(value: T): void {
    for (const l of [...this.listeners]) l(value);
  }
  clear(): void { this.listeners = []; }
}

/** Create a PHP editor inside `container`, backed by the language server at `options.serverUrl`. */
export function createPhpEditor(container: HTMLElement, options: CreatePhpEditorOptions): PhpEditorInstance {
  const documentName = options.documentName ?? 'untitled.php';
  let theme: PhpEditorTheme = options.theme ?? 'auto';
  let state: PhpEditorConnectionState = 'connecting';
  let disposed = false;
  let model: monaco.editor.ITextModel | null = null;
  let documentUri = '';
  const providers: BaseProvider[] = [];
  const disposables: monaco.IDisposable[] = [];

  const diagnosticsEmitter = new Emitter<PhpEditorDiagnostic[]>();
  const stateEmitter = new Emitter<PhpEditorConnectionState>();
  const messageEmitter = new Emitter<{ type: lsp.MessageType; message: string }>();
  const setState = (s: PhpEditorConnectionState) => { state = s; stateEmitter.fire(s); };

  if (options.setupWorkers !== false) ensureMonacoWorkers();

  if (!monaco.languages.getLanguages().some((l) => l.id === LANGUAGE_ID)) {
    monaco.languages.register({ id: LANGUAGE_ID, extensions: ['.php'], aliases: ['PHP'] });
  }

  const editor = monaco.editor.create(container, {
    value: '',
    language: LANGUAGE_ID,
    theme: resolveMonacoTheme(theme),
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    ...options.editorOptions,
  });
  // Placeholder model until the server assigns this client's workspace URI.
  model = editor.getModel();
  model?.setValue(options.initialCode ?? '');

  const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const onSystemTheme = () => { if (theme === 'auto') monaco.editor.setTheme(resolveMonacoTheme('auto')); };
  media?.addEventListener('change', onSystemTheme);

  const client = new LspWebSocketClient(options.serverUrl);
  let resolveWorkspace!: (uri: string) => void;
  const workspaceUri = new Promise<string>((r) => { resolveWorkspace = r; });

  client.onNotification((message: JsonRpcMessage) => handleServerMessage(message));
  client.onClose(() => { if (!disposed && state === 'connected') setState('disconnected'); });

  function handleServerMessage(message: JsonRpcMessage): void {
    switch (message.method) {
      case 'client/workspace': {
        const params = (message.params ?? {}) as { workspaceUri?: string };
        if (params.workspaceUri) resolveWorkspace(params.workspaceUri);
        return;
      }
      case 'textDocument/publishDiagnostics': {
        const params = message.params as lsp.PublishDiagnosticsParams;
        if (!params || params.uri !== documentUri) return;
        const diagnostics: PhpEditorDiagnostic[] = (params.diagnostics ?? []).map((d) => ({
          uri: params.uri,
          message: d.message,
          severity: d.severity ?? 1,
          startLineNumber: d.range.start.line + 1,
          startColumn: d.range.start.character + 1,
          endLineNumber: d.range.end.line + 1,
          endColumn: d.range.end.character + 1,
          source: d.source,
          code: d.code !== undefined ? String(d.code) : undefined,
        }));
        if (model) {
          monaco.editor.setModelMarkers(model, 'devsense-php-ls', diagnostics.map((d): monaco.editor.IMarkerData => ({
            startLineNumber: d.startLineNumber,
            startColumn: d.startColumn,
            endLineNumber: d.endLineNumber,
            endColumn: d.endColumn,
            message: d.message,
            severity: toMonacoSeverity(d.severity),
            source: d.source,
            code: d.code,
          })));
        }
        diagnosticsEmitter.fire(diagnostics);
        return;
      }
      case 'window/showMessage':
      case 'window/logMessage': {
        const params = message.params as lsp.ShowMessageParams;
        if (params) messageEmitter.fire({ type: params.type, message: params.message });
        return;
      }
      default:
        return;
    }
  }

  function registerProviders(): void {
    const base = { selector: { language: LANGUAGE_ID }, languageId: LANGUAGE_ID, monaco };
    providers.push(
      new CompletionProvider(client, base),
      new HoverProvider(client, base),
      new SignatureHelpProvider(client, { ...base, triggerCharacters: ['(', ',', '<'] }),
      new DefinitionProvider(client, base),
      new ReferencesProvider(client, base),
      new DocumentSymbolProvider(client, base),
      new CodeActionProvider(client, base),
      new FormattingProvider(client, base),
      new RangeFormattingProvider(client, base),
      new OnTypeFormattingProvider(client, { ...base, autoFormatTriggerCharacters: ['}', ')', ';'] }),
      new SemanticTokensProvider(client, { ...base, legend: { tokenTypes: [], tokenModifiers: [] } }),
      new InlineCompletionProvider(client, base),
      new InlayHintsProvider(client, base),
      new CodeLensProvider(client, base),
      new RenameProvider(client, base),
    );
    for (const p of providers) p.register(monaco);
  }

  async function start(): Promise<void> {
    await client.connect();
    const root = await workspaceUri;
    if (disposed) return;

    // Move the document into this client's sandbox.
    const text = model?.getValue() ?? options.initialCode ?? '';
    const placeholder = model;
    model = monaco.editor.createModel(text, LANGUAGE_ID, monaco.Uri.parse(`${root}${documentName}`));
    editor.setModel(model);
    placeholder?.dispose();
    documentUri = model.uri.toString();

    const initParams: lsp.InitializeParams = {
      processId: null,
      rootUri: null,
      capabilities: CLIENT_CAPABILITIES,
      initializationOptions: options.initializationOptions ?? {},
    };
    await client.sendRequest('initialize', initParams);
    client.sendNotification('initialized', {});

    const openParams: lsp.DidOpenTextDocumentParams = {
      textDocument: { uri: documentUri, languageId: LANGUAGE_ID, version: model.getVersionId(), text: model.getValue() },
    };
    client.sendNotification('textDocument/didOpen', openParams);

    const current = model;
    disposables.push(current.onDidChangeContent(() => {
      const changeParams: lsp.DidChangeTextDocumentParams = {
        textDocument: { uri: documentUri, version: current.getVersionId() },
        contentChanges: [{ text: current.getValue() }],
      };
      client.sendNotification('textDocument/didChange', changeParams);
    }));

    registerProviders();
    setState('connected');
  }

  const ready = start().catch((err: unknown) => {
    if (!disposed) setState('failed');
    throw err instanceof Error ? err : new Error(String(err));
  });
  // Avoid an unhandled rejection when the caller never awaits `ready`.
  ready.catch(() => undefined);

  return {
    monaco,
    editor,
    ready,
    getValue: () => editor.getValue(),
    setValue: (code) => { editor.getModel()?.setValue(code); },
    setTheme: (t) => { theme = t; monaco.editor.setTheme(resolveMonacoTheme(t)); },
    getTheme: () => theme,
    getDocumentUri: () => documentUri,
    getConnectionState: () => state,
    onDiagnostics: (l) => diagnosticsEmitter.on(l),
    onConnectionStateChange: (l) => stateEmitter.on(l),
    onServerMessage: (l) => messageEmitter.on(l),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (documentUri && client.isOpen()) {
        const closeParams: lsp.DidCloseTextDocumentParams = { textDocument: { uri: documentUri } };
        client.sendNotification('textDocument/didClose', closeParams);
      }
      for (const p of providers) p.dispose();
      for (const d of disposables) d.dispose();
      media?.removeEventListener('change', onSystemTheme);
      diagnosticsEmitter.clear();
      stateEmitter.clear();
      messageEmitter.clear();
      editor.dispose();
      model?.dispose();
      client.close();
    },
  };
}
