/**
 * Monaco Editor setup + LSP provider wiring.
 *
 * Monaco Editor is injected via the constructor (loaded via AMD loader
 * from /public/monaco-editor/ in index.html), not imported directly.
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

  constructor(opts: EditorOptions) {
    this.monaco = opts.monaco;
    this.ws = new WsClient(opts.wsUrl);
    this.diagnostics = new DiagnosticsPanel();
    this.theme = new ThemeManager();
    this.init(opts.containerId, opts.initialContent);
  }

  private async init(containerId: string, initialContent?: string): Promise<void> {
    await this.ws.connect();

    this.ws.setOnMessage((message) => this.handleServerMessage(message));

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
    // The real client id is assigned by the server; we'll learn it after
    // initialize and recreate the model with the correct URI.
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
      this.ws.sendNotification('textDocument/didChange', {
        textDocument: { uri: this.virtualDocUri, version: this.model?.getVersionId() ?? 0 },
        contentChanges: [{ text: this.model?.getValue() ?? '' }],
      });
    });
  }

  private async performInitialize(): Promise<void> {
    console.log('[editor] Sending initialize to WS server...');
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
    this.ws.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: this.virtualDocUri,
        languageId: 'php',
        version: 1,
        text: this.model?.getValue() ?? '',
      },
    });
  }

  private registerProviders(): void {
    const selector = { language: 'php' };
    const ws = this.ws as any;
    const lang = this.monaco.languages;

    const providers = [
      new CompletionProvider(ws, { selector, languageId: 'php' }),
      new HoverProvider(ws, { selector, languageId: 'php' }),
      new SignatureHelpProvider(ws, { selector, languageId: 'php', triggerCharacters: ['(', ',', '<'] }),
      new DefinitionProvider(ws, { selector, languageId: 'php' }),
      new ReferencesProvider(ws, { selector, languageId: 'php' }),
      new DocumentSymbolProvider(ws, { selector, languageId: 'php' }),
      new CodeActionProvider(ws, { selector, languageId: 'php' }),
      new FormattingProvider(ws, { selector, languageId: 'php' }),
      new RangeFormattingProvider(ws, { selector, languageId: 'php' }),
      new OnTypeFormattingProvider(ws, { selector, languageId: 'php', autoFormatTriggerCharacters: ['}', ')', ';'] }),
      new SemanticTokensProvider(ws, { selector, languageId: 'php', legend: { tokenTypes: [], tokenModifiers: [] } }),
      new InlineCompletionProvider(ws, { selector, languageId: 'php' }),
      new InlayHintsProvider(ws, { selector, languageId: 'php' }),
      new CodeLensProvider(ws, { selector, languageId: 'php' }),
      new RenameProvider(ws, { selector, languageId: 'php' }),
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
