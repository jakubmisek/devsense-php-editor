# DEVSENSE PHP Editor

An online PHP editor: [Monaco Editor](https://microsoft.github.io/monaco-editor/) in the browser, backed by the
[DEVSENSE PHP language server](https://www.npmjs.com/package/devsense-php-ls) (`devsense-php-ls`) running on a Node.js server.
The browser talks to the language server over a WebSocket using JSON-RPC (LSP messages).

This is an npm-workspaces monorepo with two packages:

| Package | What it is |
| --- | --- |
| [`packages/devsense-php-editor`](packages/devsense-php-editor) | The library. Node side: the `PhpEditor` class (spawns `devsense-php-ls`, runs the WebSocket server and routes messages). Browser side: `devsense-php-editor/browser`, a set of Monaco language providers that forward LSP requests. |
| [`packages/devsense-php-editor-sampleweb`](packages/devsense-php-editor-sampleweb) | A sample web app (Vite + Monaco) that uses the library, plus the Playwright end-to-end tests. |

## Architecture

```
 Browser (Monaco + devsense-php-editor/browser providers)  ×N clients
        │  WebSocket, JSON-RPC (LSP)
        ▼
 PhpEditor (Node)  ──  WsServer ── Router ── LsServer
                                              │ stdio
                                              ▼
                                   devsense-php-ls (one process)
```

- **One shared language server.** `PhpEditor.start()` spawns a single `devsense-php-ls` process and the `Router` performs the
  only real `initialize` / `initialized` handshake with it at startup. The resulting capabilities are cached.
- **Faked per-client `initialize`.** When a browser client sends `initialize`, the Router answers locally with the cached
  `InitializeResult`. A client's `initialized`, `shutdown` and `exit` are swallowed (`shutdown` gets a `null` result), so
  a client connecting, reloading or disconnecting never restarts or re-initializes the shared server.
- **`untitled-workspace-{id}://` sandboxing.** Each WebSocket connection gets its own virtual workspace
  (`VirtualWorkspace`) with the scheme `untitled-workspace-{clientId}://`. Right after connecting, the server sends the
  client a `client/workspace` notification with `{ clientId, workspaceUri }`. The client must create its documents under
  that URI (for example `untitled-workspace-client-1://untitled.php`). The Router records which client opened which document
  (`textDocument/didOpen`) and routes `textDocument/publishDiagnostics` only to the owning client. LS request ids are
  remapped per client, so concurrent clients never see each other's responses.
- `$/devsense/stats` (a request) returns `{ lsInitializeCount, clientId, clients }`. It's used by the tests to prove there is
  only one real `initialize`.

## Features

Monaco providers in `devsense-php-editor/browser`, each mapped to an LSP request:

| Provider | LSP method |
| --- | --- |
| `CompletionProvider` | `textDocument/completion` |
| `HoverProvider` | `textDocument/hover` |
| `SignatureHelpProvider` | `textDocument/signatureHelp` |
| `DefinitionProvider` | `textDocument/definition` |
| `ReferencesProvider` | `textDocument/references` |
| `DocumentSymbolProvider` | `textDocument/documentSymbol` |
| `CodeActionProvider` | `textDocument/codeAction` |
| `FormattingProvider` | Format Document, sent as `textDocument/rangeFormatting` over the whole document (the server has no `textDocument/formatting`) |
| `RangeFormattingProvider` | `textDocument/rangeFormatting` |
| `OnTypeFormattingProvider` | `textDocument/onTypeFormatting` |
| `SemanticTokensProvider` | `textDocument/semanticTokens/full` |
| `InlineCompletionProvider` | `textDocument/inlineCompletion` (needs a licence, see below) |
| `InlayHintsProvider` | `textDocument/inlayHint` |
| `CodeLensProvider` | `textDocument/codeLens` (+ `codeLens/resolve`) |
| `RenameProvider` | `textDocument/rename` |

Diagnostics come from the server as `textDocument/publishDiagnostics` notifications. The client turns them into Monaco
markers (see the sample's `editor.ts`).

## Requirements

- Node.js 18 or newer (`engines.node >= 18`).
- npm 7+ (workspaces).
- `devsense-php-ls` is an npm dependency of the library and installs with it. The sample and the tests need the
  platform binary it provides.
- For the tests: Playwright's Chromium (`npx playwright install chromium`).

## Getting started (this repo)

```bash
npm install          # installs all workspaces; the library's `prepare` script builds it
npm run dev          # builds the library, starts PhpEditor + Vite on http://localhost:5173
```

## Using the `devsense-php-editor` package

```bash
npm install devsense-php-editor monaco-editor
```

`monaco-editor` is an (optional) peer dependency. The library uses only its types. Your app imports and bundles Monaco
itself.

The package has two entry points:

| Import | Environment | File |
| --- | --- | --- |
| `devsense-php-editor` | Node (CommonJS) | `dist/index.js`, types in `dist/types/index.d.ts` |
| `devsense-php-editor/browser` | Browser (ESM) | `dist-browser/providers.browser.js`, types in `dist/types/providers/browser-index.d.ts` |

Build outputs (`dist/`, `dist-browser/`) are not committed. `npm run build` (or `prepare` on install) produces them.

### Server side: `PhpEditor`

```ts
import { PhpEditor, type PhpEditorOptions } from 'devsense-php-editor';
```

`new PhpEditor(options?: PhpEditorOptions)`

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `port` | `number` | `8765` | WebSocket port. `0` picks a free port. |
| `host` | `string` | `'127.0.0.1'` | Interface the WebSocket server binds to. |
| `licenseKey` | `string` | `process.env.DEVSENSE_PHP_LS_LICENSE` | DEVSENSE licence key or JSON offline activation code, passed as `initializationOptions["0"]`. |
| `initializationOptions` | `Record<string, unknown>` | – | Extra options merged into the language server `initialize`. |
| `cwd` | `string` | – | Working directory of the `devsense-php-ls` process. |
| `env` | `Record<string, string>` | – | Extra environment variables for the `devsense-php-ls` process (merged over `process.env`). |
| `logger` | `(msg: string) => void` | – | Optional log callback. |
| `portFile` | `string` | – | If set, the bound WebSocket port is written to this file (the directory is created if needed). |

Methods:

| Method | Returns |
| --- | --- |
| `start()` | `Promise<number>`: spawns the LS, waits for the single `initialize`, starts the WebSocket server; resolves with the port. Calling it again while running returns the same port. |
| `stop()` | `Promise<void>`: `shutdown`/`exit` to the LS, then closes the WebSocket server and the process. |
| `getPort()` | `number \| null` |
| `getUrl()` | `string \| null`, e.g. `ws://127.0.0.1:8765` |
| `isRunning()` | `boolean` |
| `getWsServer()`, `getLsServer()`, `getRouter()` | Internal parts, for advanced use and tests. |

`PhpEditor` runs its **own** WebSocket server on `host:port`. It doesn't attach to an existing `http.Server`. Run it next
to your HTTP server and tell the page where the WebSocket is:

```ts
import http from 'node:http';
import { PhpEditor } from 'devsense-php-editor';

const editor = new PhpEditor({
  port: 8765,
  host: '127.0.0.1',
  licenseKey: process.env.DEVSENSE_PHP_LS_LICENSE, // optional; this is also the default
  logger: (msg) => console.log('[php-editor]', msg),
});

await editor.start();
const wsUrl = editor.getUrl()!; // ws://127.0.0.1:8765

// Your web server: serve the app (your Monaco bundle) and pass it the WebSocket URL.
http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(`<!doctype html>
<meta name="php-editor-ws-url" content="${wsUrl}">
<div id="editor" style="height:100vh"></div>
<script type="module" src="/app.js"></script>`);
}).listen(3000);

process.on('SIGINT', async () => { await editor.stop(); process.exit(0); });
```

In production, put both behind one reverse proxy (for example proxy `/ws` to the PhpEditor port) and bind `host` to
an interface the proxy can reach.

There's also a CLI (the package `bin`, also used by the sample):

```bash
npx devsense-php-editor [portFile]     # same as: node dist/index.js [portFile]
```

It starts `PhpEditor` with the defaults (port 8765), optionally writes the port to `portFile`, and stops cleanly on Ctrl+C.

### Browser side: `devsense-php-editor/browser`

Every provider has the same shape:

```ts
new XProvider(sender: LspRequestSender, options: { selector, languageId, monaco, ...extra })
provider.register(monaco)   // registers with monaco.languages.*
provider.dispose()          // unregisters
```

- `sender` is any object with `sendRequest(method: string, params?: unknown): Promise<unknown>` that resolves with the
  LSP `result`. The package does **not** ship a WebSocket client. A minimal one is below; the sample's
  [`ws-client.ts`](packages/devsense-php-editor-sampleweb/src/ws-client.ts) is a fuller version.
- `monaco` is the `monaco-editor` module namespace (`import * as monaco from 'monaco-editor'`). Providers read
  `monaco.Range`, `monaco.languages.*` enums and so on from it.
- Extra options: `SignatureHelpProvider` takes `triggerCharacters`, `OnTypeFormattingProvider` takes
  `autoFormatTriggerCharacters`, and `SemanticTokensProvider` takes a `legend`.
- Exported types: `MonacoApi`, `LspRequestSender`, `BaseProviderOptions` and `XProviderOptions` for each provider.

```ts
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'; // Vite syntax
import {
  CompletionProvider, HoverProvider, SignatureHelpProvider, DefinitionProvider, ReferencesProvider,
  DocumentSymbolProvider, CodeActionProvider, FormattingProvider, RangeFormattingProvider,
  OnTypeFormattingProvider, SemanticTokensProvider, InlineCompletionProvider, InlayHintsProvider,
  CodeLensProvider, RenameProvider, type LspRequestSender,
} from 'devsense-php-editor/browser';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

// 1. Minimal JSON-RPC client over WebSocket.
const wsUrl = document.querySelector('meta[name="php-editor-ws-url"]')!.getAttribute('content')!;
const socket = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map<number, (result: unknown) => void>();
let onWorkspace!: (uri: string) => void;
const workspaceUri = new Promise<string>((r) => (onWorkspace = r));
const send = (msg: object) => socket.send(JSON.stringify({ jsonrpc: '2.0', ...msg }));
const notify = (method: string, params: unknown) => send({ method, params });
const sender: LspRequestSender = {
  sendRequest: (method, params) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    send({ id, method, params });
  }),
};
socket.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)!(msg.result ?? null); pending.delete(msg.id); }
  else if (msg.method === 'client/workspace') onWorkspace(msg.params.workspaceUri);
  else if (msg.method === 'textDocument/publishDiagnostics') { /* map to monaco.editor.setModelMarkers(...) */ }
};
await new Promise((r) => socket.addEventListener('open', r, { once: true }));

// 2. Handshake (answered from the server's cache) and a document in this client's sandbox.
await sender.sendRequest('initialize', { processId: null, rootUri: null, capabilities: {} });
notify('initialized', {});
const uri = monaco.Uri.parse(`${await workspaceUri}untitled.php`);
const model = monaco.editor.createModel('<?php\necho strlen("hi");\n', 'php', uri);
const editor = monaco.editor.create(document.getElementById('editor')!, { model });
notify('textDocument/didOpen', { textDocument: { uri: uri.toString(), languageId: 'php', version: 1, text: model.getValue() } });
model.onDidChangeContent(() => notify('textDocument/didChange', {
  textDocument: { uri: uri.toString(), version: model.getVersionId() },
  contentChanges: [{ text: model.getValue() }],
}));

// 3. Register the providers.
const opts = { selector: { language: 'php' }, languageId: 'php', monaco };
const providers = [
  new CompletionProvider(sender, opts),
  new HoverProvider(sender, opts),
  new SignatureHelpProvider(sender, { ...opts, triggerCharacters: ['(', ','] }),
  new DefinitionProvider(sender, opts),
  new ReferencesProvider(sender, opts),
  new DocumentSymbolProvider(sender, opts),
  new CodeActionProvider(sender, opts),
  new FormattingProvider(sender, opts),
  new RangeFormattingProvider(sender, opts),
  new OnTypeFormattingProvider(sender, { ...opts, autoFormatTriggerCharacters: ['}', ';'] }),
  new SemanticTokensProvider(sender, { ...opts, legend: { tokenTypes: [], tokenModifiers: [] } }),
  new InlineCompletionProvider(sender, opts),
  new InlayHintsProvider(sender, opts),
  new CodeLensProvider(sender, opts),
  new RenameProvider(sender, opts),
];
providers.forEach((p) => p.register(monaco));
```

Load Monaco through your bundler from the `monaco-editor` package (workers, CSS and fonts all resolve from the
package). Don't copy Monaco into a public folder.

### Configuration and environment variables

| Variable | Where | Meaning |
| --- | --- | --- |
| `DEVSENSE_PHP_LS_LICENSE` | Node process running `PhpEditor` | DEVSENSE licence key or JSON offline activation code. Used when `licenseKey` isn't passed; sent as `initializationOptions["0"]`. |
| `CI` | Playwright | When set, Playwright never reuses an already running dev server. |
| `window.PHP_EDITOR_WS_URL` | Sample web app (browser) | Overrides the WebSocket URL the sample connects to. |

**Licence note:** the editor features work without a licence, but some premium features of `devsense-php-ls` need one.
In particular `textDocument/inlineCompletion` returns `null` in every case we tried without a licence. The client
provider is implemented, but ghost text appears only with a licensed (and possibly AI-enabled) server. Set
`DEVSENSE_PHP_LS_LICENSE` or pass `licenseKey`.

## Sample web app

From the repo root (or use the same script names inside `packages/devsense-php-editor-sampleweb`):

| Command | What it does |
| --- | --- |
| `npm run dev` | `predev` builds the library, then `concurrently` runs the PhpEditor CLI (writes its port to `public/php-editor-port`) and Vite on `http://localhost:5173` (bound to `0.0.0.0`). |
| `npm run build` | Builds the library, then `vite build` builds the app into `packages/devsense-php-editor-sampleweb/dist`. |
| `npm run preview -w packages/devsense-php-editor-sampleweb` | `vite preview` serves the built `dist`. It doesn't start a language server. Run `node packages/devsense-php-editor/dist/index.js` alongside it (port 8765, the sample's fallback URL) for LSP features. |

The sample finds the WebSocket URL in this order: `window.PHP_EDITOR_WS_URL`, the `/php-editor-port` file served by Vite,
`<meta name="php-editor-ws-url">`, then `ws://127.0.0.1:8765`.

## Tests and typecheck

```bash
npx playwright install chromium     # once
npm test                            # = playwright test in the sample package
npm run typecheck                   # tsc --noEmit for the library and the sample
```

`npm test` runs the Playwright suite (`packages/devsense-php-editor-sampleweb/tests`, Chromium, headless). Its
`webServer` builds the library and starts PhpEditor + Vite on port 5173 automatically. A single spec:
`npx playwright test tests/hover.spec.ts` from the sample folder. Artifacts go to `test-results/` and are git-ignored.

## Known server-side limitations

These tests fail because of `devsense-php-ls` behaviour, not the editor:

- **Diagnostics:** `devsense-php-ls` publishes no `textDocument/publishDiagnostics` for `untitled-workspace-{id}://`
  URIs. The same text under `untitled:` or `file://` gets diagnostics. So the diagnostics panel, the markers and the
  diagnostics-driven code actions stay empty (3 tests).
- **Rename:** `textDocument/rename` answers `-32803 Cannot rename a built-in symbol` for `untitled-workspace-{id}://`
  documents (it works for `file://`). The client already converts the WorkspaceEdit (1 test).
- **Inline completion:** `textDocument/inlineCompletion` returns `null` without a licence (1 test, see the licence note).

Expected result today: 30 passed, 5 failed (the above).

## Project layout

```
.
├── package.json                      # workspaces + root scripts (build, dev, test, typecheck)
├── SPEC.md, MILESTONES.md, status.md # spec, milestones, current feature status
└── packages/
    ├── devsense-php-editor/          # the library
    │   ├── build.js                  # esbuild: dist/index.js (Node CJS), dist-browser/providers.browser.js (ESM), tsc .d.ts
    │   ├── tsconfig.json             # typecheck; tsconfig.types.json emits declarations
    │   └── src/
    │       ├── index.ts              # Node entry + CLI (exports PhpEditor)
    │       ├── PhpEditor.ts          # public server API
    │       ├── lsp/client.ts         # JSON-RPC over the LS stdio
    │       ├── server/               # LsServer (process), WsServer (WebSocket), Router (shared LS, fake initialize, routing)
    │       ├── workspace/VirtualWorkspace.ts   # untitled-workspace-{id}:// per client
    │       └── providers/            # Monaco providers; browser-index.ts = devsense-php-editor/browser
    └── devsense-php-editor-sampleweb/   # sample app + tests
        ├── index.html, vite.config.ts, tsconfig.json, playwright.config.ts
        ├── src/                      # main.ts, editor.ts (provider wiring), ws-client.ts, diagnostics.ts, theme.ts, types.ts
        └── tests/                    # Playwright specs
```

## License

MIT (see `license` in `packages/devsense-php-editor/package.json`). `devsense-php-ls` is a separate DEVSENSE product
with its own licence terms.
