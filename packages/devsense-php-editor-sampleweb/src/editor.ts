/**
 * Monaco Editor setup + LSP provider wiring.
 *
 * Monaco Editor is injected via the constructor (loaded via AMD loader
 * from /monaco-editor/ in index.html), not imported directly.
 * This keeps monaco-editor as a browser-loaded dependency, not a bundled one.
 */
import { WsClient } from './ws-client';
import { DiagnosticsPanel } from './diagnostics';
import { ThemeManager } from './theme';

// Browser-safe LSP providers (built from providers.browser.js).
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
} from './providers.browser.js';

export interface EditorOptions {
  wsUrl: string;
  containerId: string;
  initialContent?: string;
  monaco: any;
}

export class PhpEditorUI {
  private ws: WsClient;
  private editor: any = null;
  private model: any = null;
  private diagnostics: DiagnosticsPanel;
  private theme: ThemeManager;
  private providers: Array<{ dispose(): void }> = [];
  private virtualDocUri: string = '';
  private readonly monaco: any;
  private wsConnected = false;

  constructor(opts: EditorOptions) {
    this.monaco = opts.monaco;
    this.ws = new WsClient(opts.wsUrl);
    this.diagnostics = new DiagnosticsPanel();
    this.theme = new ThemeManager();
    console.log('[editor] PhpEditorUI created, WS URL:', opts.wsUrl);
    // Connect to WS non-blocking; editor creation should not depend on WS.
    this.ws.connect().then(() => {
      this.wsConnected = true;
      console.log('[editor] WebSocket connected');
      this.ws.setOnMessage((message) => {
        console.log('[editor] <- Server message:', message.method || message.id || 'response');
        this.handleServerMessage(message);
      });
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
    this.init(opts.containerId, opts.initialContent);
  }

  private async init(containerId: string, initialContent?: string): Promise<void> {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found`);

    console.log('[editor] Creating Monaco Editor...');
    this.editor = this.monaco.editor.create(container, {
      value: initialContent ?? '<?php\n\n// Hello from DEVSENSE PHP Editor\n\nfunction greet(string $name): void {\n    echo "Hello, " . $name;\n}\n',
      language: 'php',
      theme: this.theme.getTheme() === 'dark' ? 'vs-dark' : 'vs',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
    });

    DiagnosticsPanel.injectStyles();

    this.monaco.languages.register({ id: 'php', extensions: ['.php'], aliases: ['PHP'] });

    // Create virtual document model with untitled-workspace schema.
    this.model = this.monaco.editor.createModel(
      initialContent ?? '<?php\n\n// Hello from DEVSENSE PHP Editor\n',
      'php',
      this.monaco.Uri.parse('untitled-workspace-client://untitled.php')
    );
    this.editor.setModel(this.model);
    this.virtualDocUri = this.model.uri.toString();

    console.log('[editor] Model created:', this.virtualDocUri);

    await this.performInitialize();
    this.registerProviders();

    this.editor.onDidChangeModelContent((e: any) => {
      console.log('[editor] Model content changed');
      if (this.wsConnected) {
        this.ws.sendNotification('textDocument/didChange', {
          textDocument: { uri: this.virtualDocUri, version: this.model?.getVersionId() ?? 0 },
          contentChanges: [{ text: this.model?.getValue() ?? '' }],
        });
      }
    });
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
    const ws = this.ws as any;
    const lang = this.monaco.languages;

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
      p.register(lang);
      this.providers.push(p);
    }
    console.log('[editor]', providers.length, 'providers registered');
  }

  private handleServerMessage(message: any): void {
    const method = message.method;
    const params = message.params || {};

    if (method === 'textDocument/publishDiagnostics') {
      const uri = params.textDocument?.uri;
      if (uri && uri === this.virtualDocUri) {
        const markers = (params.diagnostics || []).map((d: any) => ({
          uri,
          message: d.message,
          severity: d.severity ?? 1,
          startLineNumber: (d.range?.start?.line ?? 0) + 1,
          startColumn: (d.range?.start?.character ?? 0) + 1,
          endLineNumber: (d.range?.end?.line ?? 0) + 1,
          endColumn: (d.range?.end?.character ?? 0) + 1,
          source: d.source,
          code: d.code,
        }));
        this.diagnostics.setDiagnostics(uri, markers);

        if (this.model) {
          this.monaco.editor.setModelMarkers(this.model, 'devsense-php-ls', markers.map((m: any) => ({
            startLineNumber: m.startLineNumber,
            startColumn: m.startColumn,
            endLineNumber: m.endLineNumber,
            endColumn: m.endColumn,
            message: m.message,
            severity: m.severity,
            source: m.source,
            code: m.code,
          })));
        }
      }
    }

    if (method === 'window/showMessage') {
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
