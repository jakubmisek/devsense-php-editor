/**
 * Monaco web worker setup.
 *
 * PHP only needs Monaco's generic editor worker (language features come from
 * devsense-php-ls). The worker is imported with Vite's `?worker` suffix, so the
 * consumer's Vite build emits it as a separate module worker. This import is kept
 * external in the package bundle and resolved by the consumer's bundler.
 */
import type * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

type MonacoGlobal = typeof globalThis & { MonacoEnvironment?: monaco.Environment };

/** Install `self.MonacoEnvironment` with the editor worker unless the page already set one. */
export function ensureMonacoWorkers(): void {
  const g = globalThis as MonacoGlobal;
  if (g.MonacoEnvironment) return;
  g.MonacoEnvironment = { getWorker: () => new EditorWorker() };
}
