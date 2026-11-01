/**
 * Monaco Editor setup + LSP provider wiring.
 *
 * The Monaco API object is injected via the constructor (main.ts imports
 * monaco-editor, which comes transitively through devsense-php-editor).
 */
import { WsClient } from './ws-client';
import { DiagnosticsPanel } from './diagnostics';
import { ThemeManager } from './theme';
import type * as monacoNs from 'monaco-editor';
import type * as lsp from 'vscode-languageserver-protocol';
import type { JsonRpcMessage, MonacoApi } from './types';

// Browser-safe LSP providers (generated bundle: devsense-php-editor/browser).
// These forward LSP requests through the WebSocket to devsense-php-ls.
import {
  CompletionProvider,
  HoverProvider,
  SignatureHelpProvider,
  DefinitionProvider,
  ReferencesProvider,
  DocumentSymbolProvider,
  CodeActionProvider,
  FormattingProvider,
  RangeFormattingProvider,
  OnTypeFormattingProvider,
  SemanticTokensProvider,
  InlineCompletionProvider,
  InlayHintsProvider,
  CodeLensProvider,
  RenameProvider,
} from 'devsense-php-editor/browser';

export interface EditorOptions {
  wsUrl: string;
  containerId: string;
  initialContent?: string;
  monaco: MonacoApi;
}

export class PhpEditorUI {
  private ws: WsClient;
  private editor: monacoNs.editor.IStandaloneCodeEditor | null = null;
  private model: monacoNs.editor.ITextModel | null = null;
  private diagnostics: DiagnosticsPanel;
  private theme: ThemeManager;
  private providers: Array<{ dispose(): void }> = [];
  private virtualDocUri: string = '';
  /** Server-assigned workspace URI, e.g. `untitled-workspace-client-1://`. Empty until the WS hello arrives. */
  private workspaceUri: string = '';
  private readonly monaco: MonacoApi;
  private wsConnected = false;
  private readonly initialContent: string;

  constructor(opts: EditorOptions) {
    this.monaco = opts.monaco;
    this.initialContent = opts.initialContent ?? '<?php\n\n// Hello from DEVSENSE PHP Editor\n\nfunction greet(string $name): void {\n    echo "Hello, " . $name;\n}\n';
    this.ws = new WsClient(opts.wsUrl);
    this.diagnostics = new DiagnosticsPanel();
    this.theme = new ThemeManager();
    console.log('[editor] PhpEditorUI created, WS URL:', opts.wsUrl);
    // Set the message handler BEFORE connecting so the server's client/workspace
    // welcome message (sent right after the WS opens) is never missed.
    this.ws.setOnMessage((message) => {
      console.log('[editor] <- Server message:', message.method || message.id || 'response');
      this.handleServerMessage(message);
    });
    // Connect to WS non-blocking; editor creation should not depend on WS.
    this.ws.connect().then(() => {
      this.wsConnected = true;
      console.log('[editor] WebSocket connected');
      // Re-send didOpen now that we're connected
      if (this.model) {
        this.ws.sendNotification('textDocument/didOpen', {
          textDocument: {
            uri: this.virtualDocUri,
            languageId: 'php',
            version: 1,
            text: this.model?.getValue() ?? '',
          },
        });
        console.log('[editor] Re-sent textDocument/didOpen after WS connect');
      }
    }).catch((err) => {
      console.warn('[editor] WebSocket connection failed (editor will still work without LSP):', err.message);
    });
    this.init(opts.containerId);
  }

  private async init(containerId: string): Promise<void> {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found`);

    console.log('[editor] Creating Monaco Editor...');
    this.editor = this.monaco.editor.create(container, {
      value: this.initialContent,
      language: 'php',
      theme: this.theme.getTheme() === 'dark' ? 'vs-dark' : 'vs',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
    });

    DiagnosticsPanel.injectStyles();

    this.monaco.languages.register({ id: 'php', extensions: ['.php'], aliases: ['PHP'] });

    // Wait for the server-assigned workspace URI (arrives over WS as
    // client/workspace right after connect) before creating the virtual
    // document model. This avoids ever using a hardcoded URI that won't match
    // the server's per-client untitled-workspace-{id}:// scheme.
    await this.workspaceReady();
    this.createModel(this.initialContent);

    await this.performInitialize();
    this.registerProviders();

    this.editor.onDidChangeModelContent(() => {
      console.log('[editor] Model content changed');
      if (this.wsConnected && this.virtualDocUri) {
        this.ws.sendNotification('textDocument/didChange', {
          textDocument: { uri: this.virtualDocUri, version: this.model?.getVersionId() ?? 0 },
          contentChanges: [{ text: this.model?.getValue() ?? '' }],
        });
      }
    });
  }

  /** Resolves once the server-assigned workspace URI is known. */
  private readonly workspaceReadyPromise = new Promise<void>((resolve) => {
    this.resolveWorkspaceReady = resolve;
  });
  private resolveWorkspaceReady!: () => void;

  private async workspaceReady(): Promise<void> {
    return this.workspaceReadyPromise;
  }

  /** Create the virtual document model under the server-assigned workspace URI. */
  private createModel(content: string): void {
    const uri = this.workspaceUri ? `${this.workspaceUri}untitled.php` : 'untitled-workspace-client://untitled.php';
    const model = this.monaco.editor.createModel(content, 'php', this.monaco.Uri.parse(uri));
    this.model = model;
    this.editor?.setModel(model);
    this.virtualDocUri = model.uri.toString();
    console.log('[editor] Model created:', this.virtualDocUri);
  }

  private async performInitialize(): Promise<void> {
    console.log('[editor] Sending initialize to WS server...');
    if (!this.wsConnected) {
      console.warn('[editor] WS not connected, skipping initialize');
      return;
    }
    const result = await this.ws.sendRequest('initialize', {
      processId: 1,
      rootUri: null,
      capabilities: {
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
          semanticTokens: { dynamicRegistration: true },
          inlineCompletion: { dynamicRegistration: true },
          inlayHint: { dynamicRegistration: true },
          codeLens: { dynamicRegistration: true },
          rename: { dynamicRegistration: true },
        },
        workspace: { workspaceEdit: { documentChanges: true } },
      },
      initializationOptions: {},
    });

    console.log('[editor] Initialize result:', result);

    this.ws.sendNotification('initialized', {});
    console.log('[editor] Sent initialized notification');

    if (this.model) {
      this.ws.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri: this.virtualDocUri,
          languageId: 'php',
          version: 1,
          text: this.model?.getValue() ?? '',
        },
      });
      console.log('[editor] Sent textDocument/didOpen for', this.virtualDocUri);
    }
  }

  private registerProviders(): void {
    const selector = { language: 'php' };
    const ws = this.ws;

    const providers = [
      new CompletionProvider(ws, { selector, languageId: 'php', monaco: this.monaco }),
      new HoverProvider(ws, { selector, languageId: 'php', monaco: this.monaco }),
      new SignatureHelpProvider(ws, { selector, languageId: 'php', monaco: this.monaco, triggerCharacters: ['(', ',', '<'] }),
      new DefinitionProvider(ws, { selector, languageId: 'php', monaco: this.monaco }),
      new ReferencesProvider(ws, { selector, languageId: 'php', monaco: this.monaco }),
      new DocumentSymbolProvider(ws, { selector, languageId: 'php', monaco: this.monaco }),
      new CodeActionProvider(ws, { selector, languageId: 'php', monaco: this.monaco }),
      new FormattingProvider(ws, { selector, languageId: 'php', monaco: this.monaco }),
      new RangeFormattingProvider(ws, { selector, languageId: 'php', monaco: this.monaco }),
      new OnTypeFormattingProvider(ws, { selector, languageId: 'php', monaco: this.monaco, autoFormatTriggerCharacters: ['}', ')', ';'] }),
      new SemanticTokensProvider(ws, { selector, languageId: 'php', monaco: this.monaco, legend: { tokenTypes: [], tokenModifiers: [] } }),
      new InlineCompletionProvider(ws, { selector, languageId: 'php', monaco: this.monaco }),
      new InlayHintsProvider(ws, { selector, languageId: 'php', monaco: this.monaco }),
      new CodeLensProvider(ws, { selector, languageId: 'php', monaco: this.monaco }),
      new RenameProvider(ws, { selector, languageId: 'php', monaco: this.monaco }),
    ];

    for (const p of providers) {
      p.register(this.monaco);
      this.providers.push(p);
    }
    console.log('[editor]', providers.length, 'providers registered');
  }

  private handleServerMessage(message: JsonRpcMessage): void {
    const method = message.method;

    // Server hello: tells this client its assigned workspace URI so the
    // virtual document URI matches the server's per-client scheme.
    if (method === 'client/workspace') {
      const params = (message.params ?? {}) as { workspaceUri?: string };
      this.workspaceUri = params.workspaceUri ?? '';
      if (this.workspaceUri) {
        console.log('[editor] Assigned workspace URI:', this.workspaceUri);
        this.resolveWorkspaceReady?.();
        // Model may already be queued (created lazily in init after workspaceReady);
        // if it was created with the fallback URI, re-create under the real one.
        if (this.model && this.virtualDocUri !== this.workspaceUri + 'untitled.php') {
          this.createModel(this.model?.getValue() ?? this.initialContent);
        }
      }
      return;
    }

    if (method === 'textDocument/publishDiagnostics') {
      const params = message.params as lsp.PublishDiagnosticsParams;
      const uri = params?.uri;
      if (uri && uri === this.virtualDocUri) {
        const markers = (params.diagnostics || []).map((d) => ({
          uri,
          message: d.message,
          severity: d.severity ?? 1,
          startLineNumber: (d.range?.start?.line ?? 0) + 1,
          startColumn: (d.range?.start?.character ?? 0) + 1,
          endLineNumber: (d.range?.end?.line ?? 0) + 1,
          endColumn: (d.range?.end?.character ?? 0) + 1,
          source: d.source,
          code: d.code !== undefined ? String(d.code) : undefined,
        }));
        this.diagnostics.setDiagnostics(uri, markers);

        if (this.model) {
          // LSP severity (Error=1..Hint=4) -> Monaco MarkerSeverity (Error=8, Warning=4, Info=2, Hint=1).
          const S = this.monaco.MarkerSeverity;
          const toMonacoSeverity = (s: number) => (s === 1 ? S.Error : s === 2 ? S.Warning : s === 3 ? S.Info : S.Hint);
          this.monaco.editor.setModelMarkers(this.model, 'devsense-php-ls', markers.map((m): monacoNs.editor.IMarkerData => ({
            startLineNumber: m.startLineNumber,
            startColumn: m.startColumn,
            endLineNumber: m.endLineNumber,
            endColumn: m.endColumn,
            message: m.message,
            severity: toMonacoSeverity(m.severity),
            source: m.source,
            code: m.code,
          })));
        }
      }
    }

    if (method === 'window/showMessage') {
      const params = message.params as lsp.ShowMessageParams;
      console.log('[LS]', params.type, params.message);
    }
  }

  dispose(): void {
    for (const p of this.providers) p.dispose();
    this.editor?.dispose();
    this.model?.dispose();
    this.ws.close();
  }
}
