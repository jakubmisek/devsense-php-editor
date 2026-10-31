# Online PHP Editor — Specification

**Owner:** gateway-owner (human)
**PM Agent:** devsense-pm
**Status:** Draft v1.0 — 2026-10-31

## 1. Overview

The **Online PHP Editor** is a browser-based PHP code editor that combines the Monaco Editor frontend with the Devsense PHP Language Server backend. It consists of two npm packages:

1. **`devsense-php-editor`** — Core package. Provides class `PhpEditor` written in TypeScript. Runs a single `devsense-php-ls` server instance, manages its lifecycle, exposes WebSocket RPC for clients, and routes LSP provider features (completion, hover, diagnostics, formatting, etc.) through the language server.

2. **`devsense-php-editor-sampleweb`** — Sample web application depending on `devsense-php-editor` (transitively on `monaco-editor`). A single-file PHP playground with light/dark/automatic themes, diagnostics panel, and full IDE features.

Each connected client gets a unique `{id}` and dedicated virtual workspace schema `untitled-workspace-{id}://`. Diagnostics are routed by `textDocument` URI.

## 2. Architecture

### 2.1 `devsense-php-editor` (core package)

```
devsense-php-editor/
├── package.json          (name: devsense-php-editor, main, types, bin)
├── tsconfig.json
├── src/
│   ├── index.ts           (exports PhpEditor class)
│   ├── PhpEditor.ts       (main class)
│   ├── server/
│   │   ├── LsServer.ts    (spawns & manages devsense-php-ls process)
│   │   ├── WsServer.ts    (WebSocket server for client RPC)
│   │   └── Router.ts      (routes RPC between providers and LS)
│   ├── providers/
│   │   ├── CompletionProvider.ts
│   │   ├── HoverProvider.ts
│   │   ├── SignatureHelpProvider.ts
│   │   ├── DefinitionProvider.ts
│   │   ├── ReferencesProvider.ts
│   │   ├── DocumentSymbolProvider.ts
│   │   ├── CodeActionProvider.ts
│   │   ├── FormattingProvider.ts
│   │   ├── OnTypeFormattingProvider.ts
│   │   ├── SemanticTokensProvider.ts
│   │   ├── InlineCompletionProvider.ts
│   │   ├── InlayHintsProvider.ts
│   │   ├── CodeLensProvider.ts
│   │   └── RenameProvider.ts
│   ├── lsp/
│   │   ├── client.ts      (LSP client over stdio to devsense-php-ls)
│   │   └── messages.ts    (JSON-RPC message framing)
│   └── workspace/
│       └── VirtualWorkspace.ts (untitled-workspace-{id}:// management)
├── build.js               (esbuild bundle)
└── README.md
```

**`PhpEditor` class responsibilities:**
- Spawn one `devsense-php-ls` binary via `languageServerPath()` (from `devsense-php-ls` package).
- Manage LS lifecycle (start/stop/restart, `initialize`/`shutdown`/`exit` handshake).
- Pass `initializationOptions."0"` (license key or JSON code) if `DEVSENSE_PHP_LS_LICENSE` env is set.
- Listen on WebSocket port for client connections.
- Assign each client a unique `{id}` and workspace `untitled-workspace-{id}://`.
- Route LSP requests/notifications between WebSocket clients and the LS stdio.
- Route `textDocument/publishDiagnostics` by URI to the owning client.
- Expose `start(options)`, `stop()`, `getPort()`, `getUrl()`.

**Server worker** (single instance):
- Acts as an RPC router between providers and the language server.
- Maintains one LS process shared across all connected clients.
- Each client's virtual documents live under `untitled-workspace-{clientId}://`.
- LS diagnostics pushed (500ms–3s delay) are routed by `textDocument.uri`.

### 2.2 `devsense-php-editor-sampleweb` (sample application)

```
devsense-php-editor-sampleweb/
├── package.json           (depends on devsense-php-editor; NOT monaco-editor directly)
├── index.html             (single HTML entry)
├── src/
│   ├── main.ts            (entry: create editor, connect WS)
│   ├── editor.ts          (Monaco editor setup + provider wiring)
│   ├── theme.ts           (light/dark/automatic theme switching)
│   ├── diagnostics.ts     (bottom panel: list diagnostics for current doc)
│   └── ws-client.ts       (WebSocket client to PhpEditor server)
├── public/
│   └── ...
├── vite.config.ts         (or webpack)
└── README.md
```

**UI requirements:**
- Top bar: title "DEVSENSE PHP Editor Playground".
- Content area: Monaco Editor with a single virtual PHP document `untitled-workspace-{id}://untitled`.
- Bottom collapsible panel: current virtual document diagnostics (errors/warnings from LS).
- Theme switcher: light / dark / automatic.
- Full editing experience: completion, hover, signature help, definition, references, formatting, code actions, inlay hints, code lens, semantic tokens, inline completion.

**Dependency rule:** `sampleweb` must NOT list `monaco-editor` as a direct dependency. It comes transitively through `devsense-php-editor`.

## 3. Providers & Language Features

| Feature | LSP method | Monaco provider | Notes |
|---------|-----------|-----------------|-------|
| Completion | `textDocument/completion` | `CompletionItemProvider` | Trigger chars from LS |
| Hover | `textDocument/hover` | `HoverProvider` | |
| Signature Help | `textDocument/signatureHelp` | `SignatureHelpProvider` | |
| Go to Definition | `textDocument/definition` | `DefinitionProvider` | |
| References | `textDocument/references` | `ReferenceProvider` | |
| Document Symbols | `textDocument/documentSymbol` | `DocumentSymbolProvider` | |
| Code Actions | `textDocument/codeAction` | `CodeActionProvider` | |
| Formatting | `textDocument/formatting` | `DocumentFormattingEditProvider` | |
| Range Formatting | `textDocument/rangeFormatting` | `DocumentRangeFormattingEditProvider` | |
| On-Type Formatting | `textDocument/onTypeFormatting` | `OnTypeFormattingEditProvider` | |
| Semantic Tokens | `textDocument/semanticTokens/full` | `DocumentSemanticTokensProvider` | |
| Inline Completion | `textDocument/inlineCompletion` | `InlineCompletionsProvider` | |
| Inlay Hints | `textDocument/inlayHint` | `InlayHintsProvider` | |
| Code Lens | `textDocument/codeLens` | `CodeLensProvider` | |
| Rename | `textDocument/rename` | `RenameProvider` | |
| Diagnostics | `textDocument/publishDiagnostics` | `editor.setModelMarkers` | Routed by URI |

## 4. Communication Protocol (WebSocket RPC)

Clients connect via WebSocket to `ws://<host>:<port>`. Each message is JSON-RPC 2.0:

```
Client → Server:
{
  "jsonrpc": "2.0",
  "id": <number>,
  "method": "initialize" | "textDocument/didOpen" | "textDocument/didChange" | ... | "shutdown" | "exit",
  "params": { ... LSP params ... }
}

Server → Client:
{
  "jsonrpc": "2.0",
  "id": <number>,
  "result": { ... } | "error": { ... }
}

Server → Client (notification, no id):
{
  "jsonrpc": "2.0",
  "method": "textDocument/publishDiagnostics" | "window/showMessage" | ...,
  "params": { ... }
}
```

Each WebSocket connection = one client = one `{id}` = one workspace `untitled-workspace-{id}://`. The server maps URI → client connection for diagnostic routing.

## 5. Milestones

| Milestone | Goal | Deliverable |
|-----------|------|-------------|
| **M1** | Project setup & spec | Repo initialized, SPEC.md committed, git workflow defined |
| **M2** | `devsense-php-editor` core | `PhpEditor` class, LS lifecycle, WebSocket server, router |
| **M3** | LSP providers | All 12 providers wired through WS router |
| **M4** | `devsense-php-editor-sampleweb` | Monaco editor + theme + diagnostics panel + virtual doc |
| **M5** | Playwright tests | E2E tests for every feature |
| **M6** | Demo & verification | Chromium screenshot + Discord post |

## 6. Development Cycle

1. PM (this agent) writes SPEC.md and milestones, commits to repo.
2. PM spawns subagents for each package/feature with clear objectives and write scopes.
3. Subagents implement, commit directly or via PR.
4. PM reviews PRs (or direct commits), merges to master.
5. After each milestone: verify build, run tests, update MEMORY.md.
6. Once sampleweb exists: open in Chromium, screenshot, post to Discord #devsense-pm.

## 7. Repository

- Git: `git@github.com:jakubmisek/devsense-php-editor.git`
- Two packages likely in a monorepo or two separate repos under the same org. Decision: monorepo with `packages/devsense-php-editor` and `packages/devsense-php-editor-sampleweb`.
