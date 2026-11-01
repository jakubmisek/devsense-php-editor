/**
 * Browser entry point: `devsense-php-editor/browser`.
 *
 * - `createPhpEditor(container, options)` is the ready-to-use PHP editor component
 *   (Monaco + WebSocket + LSP handshake + providers + diagnostics).
 * - The individual Monaco providers and `LspWebSocketClient` are exported for
 *   advanced use (custom wiring).
 *
 * Browser-safe: no Node server code. `monaco-editor` is a runtime dependency that
 * the consumer's bundler resolves (it is not inlined into this bundle).
 */
export { createPhpEditor } from '../browser/createPhpEditor';
export type {
  CreatePhpEditorOptions,
  PhpEditorInstance,
  PhpEditorTheme,
  PhpEditorDiagnostic,
  PhpEditorConnectionState,
} from '../browser/createPhpEditor';
export { ensureMonacoWorkers } from '../browser/workers';
export { LspWebSocketClient } from '../browser/LspWebSocketClient';
export type { JsonRpcMessage } from '../browser/LspWebSocketClient';
export { CompletionProvider } from './CompletionProvider';
export type { CompletionProviderOptions } from './CompletionProvider';
export { HoverProvider } from './HoverProvider';
export type { HoverProviderOptions } from './HoverProvider';
export { SignatureHelpProvider } from './SignatureHelpProvider';
export type { SignatureHelpProviderOptions } from './SignatureHelpProvider';
export { DefinitionProvider } from './DefinitionProvider';
export type { DefinitionProviderOptions } from './DefinitionProvider';
export { ReferencesProvider } from './ReferencesProvider';
export type { ReferencesProviderOptions } from './ReferencesProvider';
export { DocumentSymbolProvider } from './DocumentSymbolProvider';
export type { DocumentSymbolProviderOptions } from './DocumentSymbolProvider';
export { CodeActionProvider } from './CodeActionProvider';
export type { CodeActionProviderOptions } from './CodeActionProvider';
export { FormattingProvider } from './FormattingProvider';
export type { FormattingProviderOptions } from './FormattingProvider';
export { RangeFormattingProvider } from './RangeFormattingProvider';
export type { RangeFormattingProviderOptions } from './RangeFormattingProvider';
export { OnTypeFormattingProvider } from './OnTypeFormattingProvider';
export type { OnTypeFormattingProviderOptions } from './OnTypeFormattingProvider';
export { SemanticTokensProvider } from './SemanticTokensProvider';
export type { SemanticTokensProviderOptions } from './SemanticTokensProvider';
export { InlineCompletionProvider } from './InlineCompletionProvider';
export type { InlineCompletionProviderOptions } from './InlineCompletionProvider';
export { InlayHintsProvider } from './InlayHintsProvider';
export type { InlayHintsProviderOptions } from './InlayHintsProvider';
export { CodeLensProvider } from './CodeLensProvider';
export type { CodeLensProviderOptions } from './CodeLensProvider';
export { RenameProvider } from './RenameProvider';
export type { RenameProviderOptions } from './RenameProvider';
export { BaseProvider } from './base';
export type { MonacoLanguageApi, MonacoApi, LspRequestSender, BaseProviderOptions } from './base';
