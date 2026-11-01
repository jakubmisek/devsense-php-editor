# Status

_Last verified: 2026-11-01 against devsense-php-ls 1.0.19490, Monaco 0.57, Chromium (Playwright)._

Full Playwright suite: **30 passed, 5 failed, 0 skipped.** No test self-skips; every failure below is real.

## Working (verified end-to-end in the browser)

| Feature | LSP method | Notes |
|---|---|---|
| Shared single language server | initialize (once) | Router does one real `initialize`; per-client initialize is faked, ids remapped, `initialized`/`shutdown`/`exit` swallowed. |
| Workspace sandboxing | — | Each client uses `untitled-workspace-{id}://`; go-to-definition does not cross workspaces. |
| Completion | textDocument/completion | Keywords, functions, variables (`$xy` → `$xyz`). |
| Hover | textDocument/hover | |
| Signature help | textDocument/signatureHelp | Popup on `strlen(`. |
| Document formatting | textDocument/rangeFormatting (full range) | Server has no `textDocument/formatting`; Format Document / Shift+Alt+F send rangeFormatting over the whole document. Server returns no edits if the file has syntax errors. |
| Range formatting | textDocument/rangeFormatting | Format Selection; lines outside the selection are left alone. |
| On-type formatting | textDocument/onTypeFormatting | |
| Document symbols | textDocument/documentSymbol | |
| Code lens | textDocument/codeLens + codeLens/resolve | |
| Inlay hints | textDocument/inlayHint | Parameter names. |
| Semantic tokens, definition, references | | |

## Not working

| Feature | Cause |
|---|---|
| Diagnostics (editor panel, code-actions test, shared-server test) | **Server side.** devsense-php-ls publishes no `textDocument/publishDiagnostics` for `untitled-workspace-{id}://` URIs, even after a 10 s wait and further `didChange` events. The same text under `untitled:` or `file://` gets diagnostics in about 1.5 s. `untitled-workspace://{id}/…` also gets diagnostics, but that form is not sandboxed. |
| Rename | **Server side.** For `untitled-workspace-{id}://` the server answers `-32803 Cannot rename a built-in symbol`. The same request for `file://` returns the correct edits. The client now converts LSP WorkspaceEdit to Monaco format, so rename will work once the server accepts the scheme. |
| Inline completion | **Server side.** `textDocument/inlineCompletion` returns `null` in every context tried, probably because it needs a licensed or AI-enabled server. The client provider is implemented (trigger-kind mapping, `{items}`/array results). |

## Build layout

- `packages/devsense-php-editor/build.js` builds `dist/index.js` (Node: PhpEditor, Router) and `dist-browser/providers.browser.js` (generated ESM Monaco providers from `src/providers/*.ts`), exported as `devsense-php-editor/browser`.
- Build outputs (`dist/`, `dist-browser/`, `dist/types/*.d.ts`) are **not committed**; they are produced by `npm install` (lib `prepare`) and by sampleweb `predev`/`prebuild`. Monaco comes only from the `monaco-editor` npm dependency through Vite imports (workers via `?worker`, CSS/fonts via the package) — no copy in `public/`.
- The sample web app imports the generated bundle. The hand-maintained `providers.browser.js` is gone.
- `tsc --noEmit` is clean.
