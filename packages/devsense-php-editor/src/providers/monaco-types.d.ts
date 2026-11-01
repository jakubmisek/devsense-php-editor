// Loose ambient aliases for the Monaco types referenced in provider signatures.
// Providers receive the Monaco API at runtime (no compile-time dependency on
// monaco-editor typings in the Node package), so these are intentionally `any`.
type ProviderResult<T> = T | null | undefined | Promise<T | null | undefined>;
type CancellationToken = any;
type Position = { lineNumber: number; column: number };
type TextEdit = any;
type IMarkdownString = any;
type FormattingOptions = { tabSize: number; insertSpaces: boolean };
type SemanticTokensLegend = any;
type SemanticTokens = any;
type SignatureInformation = any;
type SignatureHelpResult = any;
type InlineCompletions = any;
type InlineCompletionContext = any;
type InlayHintList = any;
type Hover = any;
type DocumentSymbol = any;
type Definition = any;
type CodeLensList = any;
type CodeAction = any;
