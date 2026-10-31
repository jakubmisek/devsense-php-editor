// src/providers/base.ts
import { Position, Range } from "monaco-editor";
var BaseProvider = class {
  constructor(router, languageId, selector) {
    this.disposables = [];
    this.router = router;
    this.languageId = languageId;
    this.selector = selector;
  }
  /**
   * Send an LSP request to devsense-php-ls and await the response.
   */
  async request(method, params) {
    return this.router.sendRequest(method, params);
  }
  /** Convert a Monaco Position to LSP position { line, character }. */
  toLspPosition(pos) {
    return { line: pos.lineNumber - 1, character: pos.column - 1 };
  }
  /** Convert an LSP position { line, character } to Monaco Position. */
  fromLspPosition(pos) {
    return new Position(pos.line + 1, pos.character + 1);
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
    return new Range(
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

// src/providers/CompletionProvider.ts
import {
  CompletionTriggerKind
} from "monaco-editor";
var CompletionProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
  }
  register(monaco) {
    const provider = {
      triggerCharacters: [".", ":", "$", "\\", "@", "#", "(", "[", '"', "'", "<", ">", "=", "+", "-", "*", "/"],
      provideCompletionItems: (model, position, context, token) => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          context: {
            triggerKind: context.triggerKind ?? CompletionTriggerKind.Invoke,
            triggerCharacter: context.triggerCharacter
          }
        };
        return { suggestions: [], incomplete: false };
      }
    };
    const disp = monaco.languages.registerCompletionItemProvider(this.selector, provider);
    this.disposables.push(disp);
  }
};

// src/providers/HoverProvider.ts
var HoverProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
  }
  register(monaco) {
    const provider = {
      provideHover: async (model, position, token) => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position)
        };
        try {
          const result = await this.router.sendRequest("textDocument/hover", params);
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

// src/providers/SignatureHelpProvider.ts
var SignatureHelpProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.triggerCharacters = options.triggerCharacters ?? ["(", ",", "<"];
    this.retriggerCharacters = options.retriggerCharacters ?? [",", ")"];
  }
  register(monaco) {
    const provider = {
      signatureHelpTriggerCharacters: this.triggerCharacters,
      signatureHelpRetriggerCharacters: this.retriggerCharacters,
      provideSignatureHelp: async (model, position, token, context) => {
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

// src/providers/DefinitionProvider.ts
var DefinitionProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
  }
  register(monaco) {
    const provider = {
      provideDefinition: async (model, position, token) => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position)
        };
        try {
          const result = await this.router.sendRequest("textDocument/definition", params);
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

// src/providers/ReferencesProvider.ts
var ReferencesProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
  }
  register(monaco) {
    const provider = {
      provideReferences: async (model, position, context, token) => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          context: { includeDeclaration: context.includeDeclaration ?? true }
        };
        try {
          const result = await this.router.sendRequest("textDocument/references", params);
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

// src/providers/DocumentSymbolProvider.ts
import { SymbolKind, SymbolTag } from "monaco-editor";
var DocumentSymbolProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
  }
  register(monaco) {
    const provider = {
      provideDocumentSymbols: async (model, token) => {
        const params = {
          textDocument: { uri: model.uri.toString() }
        };
        try {
          const result = await this.router.sendRequest("textDocument/documentSymbol", params);
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
    const map = {
      1: SymbolKind.File,
      2: SymbolKind.Module,
      3: SymbolKind.Namespace,
      4: SymbolKind.Package,
      5: SymbolKind.Class,
      6: SymbolKind.Method,
      7: SymbolKind.Property,
      8: SymbolKind.Field,
      9: SymbolKind.Constructor,
      10: SymbolKind.Enum,
      11: SymbolKind.Interface,
      12: SymbolKind.Function,
      13: SymbolKind.Variable,
      14: SymbolKind.Constant,
      15: SymbolKind.String,
      16: SymbolKind.Number,
      17: SymbolKind.Boolean,
      18: SymbolKind.Array,
      19: SymbolKind.Object,
      20: SymbolKind.Key,
      21: SymbolKind.Null,
      22: SymbolKind.EnumMember,
      23: SymbolKind.Struct,
      24: SymbolKind.Event,
      25: SymbolKind.Operator,
      26: SymbolKind.TypeParameter
    };
    return map[k] ?? SymbolKind.Function;
  }
  toSymbolTag(t) {
    return t === 1 ? SymbolTag.Deprecated : SymbolTag.Deprecated;
  }
};

// src/providers/CodeActionProvider.ts
var CodeActionProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
  }
  register(monaco) {
    const provider = {
      provideCodeActions: async (model, range, context, token) => {
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

// src/providers/FormattingProvider.ts
var FormattingProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
  }
  register(monaco) {
    const provider = {
      provideDocumentFormattingEdits: async (model, options, token) => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          options: {
            tabSize: options.tabSize,
            insertSpaces: options.insertSpaces
          }
        };
        try {
          const result = await this.router.sendRequest("textDocument/formatting", params);
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

// src/providers/RangeFormattingProvider.ts
var RangeFormattingProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
  }
  register(monaco) {
    const provider = {
      provideDocumentRangeFormattingEdits: async (model, range, options, token) => {
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

// src/providers/OnTypeFormattingProvider.ts
var OnTypeFormattingProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.autoFormatTriggerCharacters = options.autoFormatTriggerCharacters ?? ["}", ")", ";"];
  }
  register(monaco) {
    const provider = {
      autoFormatTriggerCharacters: this.autoFormatTriggerCharacters,
      provideOnTypeFormattingEdits: async (model, position, ch, options, token) => {
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

// src/providers/SemanticTokensProvider.ts
var SemanticTokensProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
    this.legend = options.legend;
  }
  register(monaco) {
    const provider = {
      getLegend: () => this.legend,
      provideDocumentSemanticTokens: async (model, lastResultId, token) => {
        const params = {
          textDocument: { uri: model.uri.toString() }
        };
        try {
          const result = await this.router.sendRequest("textDocument/semanticTokens/full", params);
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

// src/providers/InlineCompletionProvider.ts
var InlineCompletionProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
  }
  register(monaco) {
    const provider = {
      provideInlineCompletions: async (model, position, context, token) => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position)
        };
        try {
          const result = await this.router.sendRequest("textDocument/inlineCompletion", params);
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

// src/providers/InlayHintsProvider.ts
import { InlayHintKind } from "monaco-editor";
var InlayHintsProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
  }
  register(monaco) {
    const provider = {
      provideInlayHints: async (model, range, token) => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          range: this.toLspRange(range)
        };
        try {
          const result = await this.router.sendRequest("textDocument/inlayHint", params);
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
              kind: h.kind === 1 ? InlayHintKind.Type : InlayHintKind.Parameter,
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

// src/providers/CodeLensProvider.ts
var CodeLensProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
  }
  register(monaco) {
    const provider = {
      provideCodeLenses: async (model, token) => {
        const params = {
          textDocument: { uri: model.uri.toString() }
        };
        try {
          const result = await this.router.sendRequest("textDocument/codeLens", params);
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

// src/providers/RenameProvider.ts
var RenameProvider = class extends BaseProvider {
  constructor(router, options) {
    super(router, options.languageId, options.selector);
  }
  register(monaco) {
    const provider = {
      provideRenameEdits: async (model, position, newName, token) => {
        const params = {
          textDocument: { uri: model.uri.toString() },
          position: this.toLspPosition(position),
          newName
        };
        try {
          const result = await this.router.sendRequest("textDocument/rename", params);
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
