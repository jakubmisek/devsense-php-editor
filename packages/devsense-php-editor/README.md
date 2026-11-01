# devsense-php-editor

Core package of the [Online PHP Editor](https://github.com/jakubmisek/devsense-php-editor).

Provides the `PhpEditor` class written in TypeScript:

- Runs a single `devsense-php-ls` language server instance.
- Manages its lifecycle (`initialize`/`shutdown`/`exit` handshake).
- Exposes a WebSocket server for client RPC (JSON-RPC 2.0).
- Routes LSP messages between WebSocket clients and the language server.
- Assigns each client a unique `{id}` and virtual workspace `untitled-workspace-{id}://`.
- Routes `textDocument/publishDiagnostics` by URI to the owning client.

## Install

```bash
npm install devsense-php-editor
```

Peer/platform: the actual `devsense.php.ls` binary ships via the
`devsense-php-ls-{platform}-{arch}` optionalDependencies of `devsense-php-ls`.

## Usage

```typescript
import { PhpEditor } from 'devsense-php-editor';

const editor = new PhpEditor({
  port: 0,                 // 0 = random available port
  host: '127.0.0.1',
  // licenseKey: 'YOUR_KEY', // or set DEVSENSE_PHP_LS_LICENSE env var
});

await editor.start();
console.log('WS URL:', editor.getUrl()); // ws://127.0.0.1:<port>

// Connect a WebSocket client and send JSON-RPC 2.0 LSP messages...
// e.g. initialize, textDocument/didOpen, textDocument/didChange, shutdown

await editor.stop();
```

## Build

```bash
npm run build   # esbuild CJS bundle -> dist/index.js
```

## License

MIT

## Premium features

Code actions (shown with `(PREMIUM)`), inline completion and other premium features of
[devsense-php-ls](https://www.npmjs.com/package/devsense-php-ls) are unlocked with a licence. Set
`DEVSENSE_PHP_LS_LICENSE` (the licence key or the offline `{JSON CODE}`) for the Node process, or pass
`new PhpEditor({ license })`. The licence is sent only as `initializationOptions["0"]` of the server-side
`initialize`. It's never sent to browsers and never logged. See the repository README, section
"Premium features & licensing".
