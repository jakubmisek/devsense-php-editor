import { PhpEditor } from './PhpEditor';
export { PhpEditor };
export type { PhpEditorInfo } from './PhpEditor';
export type { PhpEditorOptions } from './PhpEditor';

// LSP-backed Monaco providers (M3) — used directly by consumers (sampleweb)
// importing from the providers barrel, NOT re-exported here so the Node core
// bundle stays free of browser-only monaco-editor AMD code.
// export * from './providers';

/** CLI entry point: start PhpEditor as a language server over WebSocket. */
async function main() {
  const portFile = process.argv[2];
  const editor = new PhpEditor({ portFile });
  const port = await editor.start();
  console.log(`PhpEditor running on ws://127.0.0.1:${port}`);

  process.on('SIGINT', async () => {
    console.log('Shutting down PhpEditor...');
    await editor.stop();
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to start PhpEditor:', err);
    process.exit(1);
  });
}
