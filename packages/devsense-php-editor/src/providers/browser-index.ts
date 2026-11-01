/**
 * Browser entry point for devsense-php-editor LSP providers.
 *
 * Exports all Monaco language providers that forward LSP requests
 * through a WebSocket router to the devsense-php-ls language server.
 *
 * This bundle is browser-safe: it only depends on 'monaco-editor' and
 * does NOT include Node server code (PhpEditor, LsServer, WsServer, etc.).
 *
 * Usage (sampleweb / any browser client):
 *   import { CompletionProvider, HoverProvider, ... } from './providers.browser.js';
 *   const ws = new WsClient('ws://localhost:PORT');
 *   const completion = new CompletionProvider(ws, { selector, languageId: 'php' });
 *   completion.register(monaco.languages);
 *
 * Providers accept any object with a `sendRequest(method, params)` method
 * (the WsClient satisfies this interface).
 */
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
