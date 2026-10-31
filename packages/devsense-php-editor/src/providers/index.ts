/**
 * Provider index — barrel export of all LSP-backed Monaco providers.
 *
 * Usage (from sampleweb / consumer):
 *   import { PhpEditor } from 'devsense-php-editor';
 *   import { CompletionProvider, HoverProvider, ... } from 'devsense-php-editor';
 *
 * Each provider's register(monaco) wires itself into the Monaco editor
 * and forwards requests through the shared Router to devsense-php-ls.
 */
export { BaseProvider } from './base';
export type { MonacoLanguageApi } from './base';

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
