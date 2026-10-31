export { PhpEditor } from './PhpEditor';
export type { PhpEditorOptions } from './PhpEditor';

// LSP-backed Monaco providers (M3) — used directly by consumers (sampleweb)
// importing from the providers barrel, NOT re-exported here so the Node core
// bundle stays free of browser-only monaco-editor AMD code.
// export * from './providers';
