// Browser-safe LSP providers for devsense-php-editor.
//
// These providers forward LSP requests through a WebSocket router to the
// devsense-php-ls language server.
//
// IMPORTANT: This file does NOT import from 'monaco-editor' directly, because
// sampleweb must NOT list monaco-editor as a direct dependency (it comes
// transitively through devsense-php-editor). Instead, the Monaco API is
// obtained from `window.monaco` (loaded via AMD loader from public/).
//
// The `monaco` object is passed into each provider's register(monaco) call,
// and `window.monaco` is used for static enums/classes (Position, Range,
// CompletionTriggerKind, SymbolKind, SymbolTag, InlayHintKind).

// ---------------------------------------------------------------------------
// BaseProvider
// ---------------------------------------------------------------------------
var BaseProvider = class {
  constructor(router, languageId, selector) {
    this.disposables = [];
    this.router = router;
    this.languageId = languageId;
    this.selector = selector;
  }

  /** Send an LSP request to devsense-php-ls and await the response. */
  async request(method, params) {
    return this.router.sendRequest(method, params);
  }

  /** Convert a Monaco Position to LSP position { line, character }. */
  toLspPosition(pos) {
    return { line: pos.lineNumber - 1, character: pos.column - 1 };
  }

  /** Convert an LSP position { line, character } to Monaco Position. */
  fromLspPosition(pos) {
    const monaco = window.monaco;
    return new monaco.Position(pos.line + 1, pos.character + 1);
  }

  /** Convert a Monaco Range to LSP range { start, end }. */
  toLspRange(range) {
    return {
      start: this.toLspPosition({ lineNumber: range.startLineNumber, column: range.startColumn }),
      end: this.toLspPosition({ lineNumber: range.endLineNumber, column: range.endColumn })
    };
  }

  /** Convert an LSP range to Monaco Range. */
  fromLspRange(range) {
    const monaco = window.monaco;
    return new monaco.Range(
      range.start.line + 1,
      range.start.character + 1,
      range.end.line + 1,
      range.end.character + 1
    );
  }

  /** Convert an LSP Location to Monaco Location. */
  fromLspLocation(loc) {
    return { uri: loc.uri, range: this.fromLspRange(loc.range) };
  }

  /** Register the Monaco provider and track its disposable. */
  register(monaco, registerFn) {
    const disp = registerFn(monaco);
    this.disposables.push(disp);
  }

  /** Dispose all registered Monaco providers. */
  dispose() {
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
      }
    }
    this.disposables = [];
  }
};

// ---------------------------------------------------------------------------
// CompletionProvider
// ---------------------------------------------------------------------------
// LSP CompletionItemKind (1-based) -> Monaco languages.CompletionItemKind.
const LSP_TO_MONACO_KIND = {
  1: 18, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 7, 9: 8, 10: 9, 11: 12, 12: 13, 13: 15,
  14: 17, 15: 27, 16: 19, 17: 20, 18: 21, 19: 23, 20: 16, 21: 14, 22: 6, 23: 10, 24: 11, 25: 24,
};

var CompletionProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
  }

  register(monaco) {
    const provider = {
      triggerCharacters: [".", ":", "$", "\\", "@", "#", "(", "[", '"', "'", "<", ">", "=", "+", "-", "*", "/"],
      provideCompletionItems: async (model, position, context, token) => {
        console.log("[CompletionProvider] Sending textDocument/completion for", model.uri.toString(), "at line", position.lineNumber, "col", position.column);
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          context: {
            triggerKind: (context.triggerKind ?? 0) + 1, // Monaco 0-based -> LSP 1-based
            triggerCharacter: context.triggerCharacter
          }
        };
        try {
          const result = await this.router.sendRequest("textDocument/completion", params);
          console.log("[CompletionProvider] Got completion result:", result?.items?.length ?? 0, "items");
          if (!result || !result.items || !Array.isArray(result.items)) {
            return { suggestions: [], incomplete: false };
          }
          const defaults = result.itemDefaults || {};
          const toRange = (r) => (r && r.start ? this.fromLspRange(r)
            : r && r.insert ? { insert: this.fromLspRange(r.insert), replace: this.fromLspRange(r.replace) } : undefined);
          const suggestions = result.items.map((item) => {
            const edit = item.textEdit;
            const insertTextFormat = item.insertTextFormat ?? defaults.insertTextFormat;
            return {
              label: item.label,
              kind: LSP_TO_MONACO_KIND[item.kind] ?? 18,
              detail: item.detail,
              documentation: item.documentation,
              insertText: edit?.newText ?? item.insertText ?? item.textEditText ?? item.label,
              insertTextRules: insertTextFormat === 2 ? 4 /* InsertAsSnippet */ : undefined,
              range: toRange(edit?.range ?? edit ?? defaults.editRange),
              sortText: item.sortText,
              filterText: item.filterText,
              preselect: item.preselect,
              commitCharacters: item.commitCharacters ?? defaults.commitCharacters,
              additionalTextEdits: item.additionalTextEdits?.map((e) => ({ range: this.fromLspRange(e.range), text: e.newText })),
              command: item.command,
            };
          });
          return { suggestions, incomplete: result.isIncomplete ?? false };
        } catch (err) {
          console.error("[CompletionProvider] Error:", err);
          return { suggestions: [], incomplete: false };
        }
      }
    };
    const disp = monaco.languages.registerCompletionItemProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// ---------------------------------------------------------------------------
// HoverProvider
// ---------------------------------------------------------------------------
var HoverProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
  }

  register(monaco) {
    const provider = {
      provideHover: async (model, position, token) => {
        console.log("[HoverProvider] Sending textDocument/hover for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position)
        };
        try {
          const result = await this.router.sendRequest("textDocument/hover", params);
          console.log("[HoverProvider] Got hover result:", !!result?.contents);
          if (!result || !result.contents) return null;
          const contents = Array.isArray(result.contents) ? result.contents : [result.contents];
          const markdownContents = contents.map((c) => {
            if (typeof c === "string") return { value: c, kind: "markdown" };
            if (c.kind && c.value) return c;
            return { value: String(c), kind: "markdown" };
          });
          return {
            contents: markdownContents,
            range: result.range ? this.fromLspRange(result.range) : void 0
          };
        } catch (err) {
          console.error("HoverProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerHoverProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// ---------------------------------------------------------------------------
// SignatureHelpProvider
// ---------------------------------------------------------------------------
var SignatureHelpProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
    this.triggerCharacters = options.triggerCharacters ?? ["(", ",", "<"];
    this.retriggerCharacters = options.retriggerCharacters ?? [",", ")"];
  }

  register(monaco) {
    const provider = {
      signatureHelpTriggerCharacters: this.triggerCharacters,
      signatureHelpRetriggerCharacters: this.retriggerCharacters,
      provideSignatureHelp: async (model, position, token, context) => {
        console.log("[SignatureHelpProvider] Sending textDocument/signatureHelp for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          context: {
            triggerKind: context.triggerKind,
            triggerCharacter: context.triggerCharacter,
            isRetrigger: context.isRetrigger,
            activeSignatureHelp: context.activeSignatureHelp
          }
        };
        try {
          const result = await this.router.sendRequest("textDocument/signatureHelp", params);
          console.log("[SignatureHelpProvider] Got signature help:", !!result?.signatures?.length);
          if (!result || !result.signatures || result.signatures.length === 0) return null;
          const signatures = result.signatures.map((s) => ({
            label: s.label,
            documentation: s.documentation,
            parameters: (s.parameters || []).map((p) => ({
              label: typeof p.label === "string" ? p.label : [p.label[0], p.label[1]],
              documentation: p.documentation
            })),
            activeParameter: s.activeParameter
          }));
          return {
            value: {
              signatures,
              activeSignature: result.activeSignature ?? 0,
              activeParameter: result.activeParameter ?? 0
            },
            dispose: () => {
            }
          };
        } catch (err) {
          console.error("SignatureHelpProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerSignatureHelpProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// ---------------------------------------------------------------------------
// DefinitionProvider
// ---------------------------------------------------------------------------
var DefinitionProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
  }

  register(monaco) {
    const provider = {
      provideDefinition: async (model, position, token) => {
        console.log("[DefinitionProvider] Sending textDocument/definition for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position)
        };
        try {
          const result = await this.router.sendRequest("textDocument/definition", params);
          console.log("[DefinitionProvider] Got definition result:", result?.length ?? 0, "locations");
          if (!result) return null;
          const locations = Array.isArray(result) ? result : [result];
          return locations.map((loc) => this.fromLspLocation(loc));
        } catch (err) {
          console.error("DefinitionProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerDefinitionProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// ---------------------------------------------------------------------------
// ReferencesProvider
// ---------------------------------------------------------------------------
var ReferencesProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
  }

  register(monaco) {
    const provider = {
      provideReferences: async (model, position, context, token) => {
        console.log("[ReferencesProvider] Sending textDocument/references for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          context: { includeDeclaration: context.includeDeclaration ?? true }
        };
        try {
          const result = await this.router.sendRequest("textDocument/references", params);
          console.log("[ReferencesProvider] Got references result:", result?.length ?? 0, "locations");
          if (!result || !Array.isArray(result)) return null;
          return result.map((loc) => this.fromLspLocation(loc));
        } catch (err) {
          console.error("ReferencesProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerReferenceProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// ---------------------------------------------------------------------------
// DocumentSymbolProvider
// ---------------------------------------------------------------------------
var DocumentSymbolProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
  }

  register(monaco) {
    const provider = {
      provideDocumentSymbols: async (model, token) => {
        console.log("[DocumentSymbolProvider] Sending textDocument/documentSymbol for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() }
        };
        try {
          const result = await this.router.sendRequest("textDocument/documentSymbol", params);
          console.log("[DocumentSymbolProvider] Got document symbols:", result?.length ?? 0, "symbols");
          if (!result || !Array.isArray(result)) return null;
          return result.map((s) => this.toDocumentSymbol(s));
        } catch (err) {
          console.error("DocumentSymbolProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerDocumentSymbolProvider(this.selector, provider);
    this.disposables.push(disp);
  }

  toDocumentSymbol(s) {
    const kind = this.toSymbolKind(s.kind);
    return {
      name: s.name,
      detail: s.detail ?? "",
      kind,
      tags: s.tags ? s.tags.map((t) => this.toSymbolTag(t)) : [],
      containerName: s.containerName,
      range: this.fromLspRange(s.range),
      selectionRange: this.fromLspRange(s.selectionRange ?? s.range),
      children: s.children ? s.children.map((c) => this.toDocumentSymbol(c)) : void 0
    };
  }

  toSymbolKind(k) {
    const monaco = window.monaco;
    const map = {
      1: monaco.SymbolKind.File,
      2: monaco.SymbolKind.Module,
      3: monaco.SymbolKind.Namespace,
      4: monaco.SymbolKind.Package,
      5: monaco.SymbolKind.Class,
      6: monaco.SymbolKind.Method,
      7: monaco.SymbolKind.Property,
      8: monaco.SymbolKind.Field,
      9: monaco.SymbolKind.Constructor,
      10: monaco.SymbolKind.Enum,
      11: monaco.SymbolKind.Interface,
      12: monaco.SymbolKind.Function,
      13: monaco.SymbolKind.Variable,
      14: monaco.SymbolKind.Constant,
      15: monaco.SymbolKind.String,
      16: monaco.SymbolKind.Number,
      17: monaco.SymbolKind.Boolean,
      18: monaco.SymbolKind.Array,
      19: monaco.SymbolKind.Object,
      20: monaco.SymbolKind.Key,
      21: monaco.SymbolKind.Null,
      22: monaco.SymbolKind.EnumMember,
      23: monaco.SymbolKind.Struct,
      24: monaco.SymbolKind.Event,
      25: monaco.SymbolKind.Operator,
      26: monaco.SymbolKind.TypeParameter
    };
    return map[k] ?? monaco.SymbolKind.Function;
  }

  toSymbolTag(t) {
    const monaco = window.monaco;
    return t === 1 ? monaco.SymbolTag.Deprecated : monaco.SymbolTag.Deprecated;
  }
};

// ---------------------------------------------------------------------------
// CodeActionProvider
// ---------------------------------------------------------------------------
var CodeActionProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
  }

  register(monaco) {
    const provider = {
      provideCodeActions: async (model, range, context, token) => {
        console.log("[CodeActionProvider] Sending textDocument/codeAction for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() },
          range: this.toLspRange(range),
          context: {
            diagnostics: (context.diagnostics || []).map((d) => ({
              range: this.toLspRange(d.range),
              severity: d.severity,
              code: d.code,
              source: d.source,
              message: d.message
            })),
            only: context.only
          }
        };
        try {
          const result = await this.router.sendRequest("textDocument/codeAction", params);
          console.log("[CodeActionProvider] Got code actions:", result?.length ?? 0, "actions");
          if (!result || !Array.isArray(result)) return null;
          return result.map((a) => ({
            title: a.title,
            command: a.command ? { id: a.command.command, title: a.command.title, arguments: a.command.arguments } : void 0,
            edit: a.edit,
            diagnostics: a.diagnostics,
            kind: a.kind,
            isPreferred: a.isPreferred,
            disabled: a.disabled
          }));
        } catch (err) {
          console.error("CodeActionProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerCodeActionProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// ---------------------------------------------------------------------------
// FormattingProvider
// ---------------------------------------------------------------------------
var FormattingProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
  }

  register(monaco) {
    const provider = {
      provideDocumentFormattingEdits: async (model, options, token) => {
        console.log("[FormattingProvider] Sending textDocument/formatting for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() },
          options: {
            tabSize: options.tabSize,
            insertSpaces: options.insertSpaces
          }
        };
        try {
          const result = await this.router.sendRequest("textDocument/formatting", params);
          console.log("[FormattingProvider] Got formatting edits:", result?.length ?? 0, "edits");
          if (!result || !Array.isArray(result)) return null;
          return result.map((e) => ({
            range: this.fromLspRange(e.range),
            text: e.text
          }));
        } catch (err) {
          console.error("FormattingProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerDocumentFormattingEditProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// ---------------------------------------------------------------------------
// RangeFormattingProvider
// ---------------------------------------------------------------------------
var RangeFormattingProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
  }

  register(monaco) {
    const provider = {
      provideDocumentRangeFormattingEdits: async (model, range, options, token) => {
        console.log("[RangeFormattingProvider] Sending textDocument/rangeFormatting for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() },
          range: this.toLspRange(range),
          options: {
            tabSize: options.tabSize,
            insertSpaces: options.insertSpaces
          }
        };
        try {
          const result = await this.router.sendRequest("textDocument/rangeFormatting", params);
          console.log("[RangeFormattingProvider] Got range formatting edits:", result?.length ?? 0, "edits");
          if (!result || !Array.isArray(result)) return null;
          return result.map((e) => ({
            range: this.fromLspRange(e.range),
            text: e.text
          }));
        } catch (err) {
          console.error("RangeFormattingProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerDocumentRangeFormattingEditProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// ---------------------------------------------------------------------------
// OnTypeFormattingProvider
// ---------------------------------------------------------------------------
var OnTypeFormattingProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
    this.autoFormatTriggerCharacters = options.autoFormatTriggerCharacters ?? ["}", ")", ";"];
  }

  register(monaco) {
    const provider = {
      autoFormatTriggerCharacters: this.autoFormatTriggerCharacters,
      provideOnTypeFormattingEdits: async (model, position, ch, options, token) => {
        console.log("[OnTypeFormattingProvider] Sending textDocument/onTypeFormatting for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          ch,
          options: {
            tabSize: options.tabSize,
            insertSpaces: options.insertSpaces
          }
        };
        try {
          const result = await this.router.sendRequest("textDocument/onTypeFormatting", params);
          console.log("[OnTypeFormattingProvider] Got on-type formatting edits:", result?.length ?? 0, "edits");
          if (!result || !Array.isArray(result)) return null;
          return result.map((e) => ({
            range: this.fromLspRange(e.range),
            text: e.text
          }));
        } catch (err) {
          console.error("OnTypeFormattingProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerOnTypeFormattingEditProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// ---------------------------------------------------------------------------
// SemanticTokensProvider
// ---------------------------------------------------------------------------
var SemanticTokensProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
    this.legend = options.legend;
  }

  register(monaco) {
    const provider = {
      getLegend: () => this.legend,
      provideDocumentSemanticTokens: async (model, lastResultId, token) => {
        console.log("[SemanticTokensProvider] Sending textDocument/semanticTokens/full for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() }
        };
        try {
          const result = await this.router.sendRequest("textDocument/semanticTokens/full", params);
          console.log("[SemanticTokensProvider] Got semantic tokens:", result?.data?.length ?? 0, "tokens");
          if (!result) return null;
          return {
            resultId: result.resultId,
            data: result.data ? new Uint32Array(result.data) : new Uint32Array(0)
          };
        } catch (err) {
          console.error("SemanticTokensProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerDocumentSemanticTokensProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// ---------------------------------------------------------------------------
// InlineCompletionProvider
// ---------------------------------------------------------------------------
var InlineCompletionProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
  }

  register(monaco) {
    const provider = {
      provideInlineCompletions: async (model, position, context, token) => {
        console.log("[InlineCompletionProvider] Sending textDocument/inlineCompletion for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position)
        };
        try {
          const result = await this.router.sendRequest("textDocument/inlineCompletion", params);
          console.log("[InlineCompletionProvider] Got inline completions:", result?.items?.length ?? 0, "items");
          if (!result || !result.items || !Array.isArray(result.items)) return null;
          return {
            items: result.items.map((item) => ({
              insertText: item.insertText,
              range: item.range ? this.fromLspRange(item.range) : void 0,
              command: item.command
            })),
            commands: []
          };
        } catch (err) {
          console.error("InlineCompletionProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerInlineCompletionsProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// ---------------------------------------------------------------------------
// InlayHintsProvider
// ---------------------------------------------------------------------------
var InlayHintsProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
  }

  register(monaco) {
    const provider = {
      provideInlayHints: async (model, range, token) => {
        console.log("[InlayHintsProvider] Sending textDocument/inlayHint for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() },
          range: this.toLspRange(range)
        };
        try {
          const result = await this.router.sendRequest("textDocument/inlayHint", params);
          console.log("[InlayHintsProvider] Got inlay hints:", result?.length ?? 0, "hints");
          if (!result || !Array.isArray(result)) return null;
          return {
            hints: result.map((h) => ({
              label: h.label,
              tooltip: h.tooltip,
              textEdits: h.textEdits ? h.textEdits.map((e) => ({
                range: this.fromLspRange(e.range),
                text: e.text
              })) : void 0,
              position: this.fromLspPosition(h.position),
              kind: h.kind === 1 ? window.monaco.InlayHintKind.Type : window.monaco.InlayHintKind.Parameter,
              paddingLeft: h.paddingLeft,
              paddingRight: h.paddingRight
            })),
            dispose: () => {
            }
          };
        } catch (err) {
          console.error("InlayHintsProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerInlayHintsProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// ---------------------------------------------------------------------------
// CodeLensProvider
// ---------------------------------------------------------------------------
var CodeLensProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
  }

  register(monaco) {
    const provider = {
      provideCodeLenses: async (model, token) => {
        console.log("[CodeLensProvider] Sending textDocument/codeLens for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() }
        };
        try {
          const result = await this.router.sendRequest("textDocument/codeLens", params);
          console.log("[CodeLensProvider] Got code lenses:", result?.length ?? 0, "lenses");
          if (!result || !Array.isArray(result)) return null;
          return {
            lenses: result.map((l) => ({
              range: this.fromLspRange(l.range),
              id: l.id,
              command: l.command ? { id: l.command.id, title: l.command.title, arguments: l.command.arguments } : void 0
            })),
            dispose: () => {
            }
          };
        } catch (err) {
          console.error("CodeLensProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerCodeLensProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// ---------------------------------------------------------------------------
// RenameProvider
// ---------------------------------------------------------------------------
var RenameProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.monaco = options.monaco;
  }

  register(monaco) {
    const provider = {
      provideRenameEdits: async (model, position, newName, token) => {
        console.log("[RenameProvider] Sending textDocument/rename for", model.uri.toString());
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          newName
        };
        try {
          const result = await this.router.sendRequest("textDocument/rename", params);
          console.log("[RenameProvider] Got rename result:", !!result);
          return result;
        } catch (err) {
          console.error("RenameProvider error:", err);
          return null;
        }
      }
    };
    const disp = monaco.languages.registerRenameProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

export {
  BaseProvider,
  CodeActionProvider,
  CodeLensProvider,
  CompletionProvider,
  DefinitionProvider,
  DocumentSymbolProvider,
  FormattingProvider,
  HoverProvider,
  InlayHintsProvider,
  InlineCompletionProvider,
  OnTypeFormattingProvider,
  RangeFormattingProvider,
  ReferencesProvider,
  RenameProvider,
  SemanticTokensProvider,
  SignatureHelpProvider
};
