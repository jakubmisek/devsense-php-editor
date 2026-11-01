/** Globals used by the demo page. */
import type { PhpEditorInstance } from 'devsense-php-editor/browser';

declare global {
  interface Window {
    /** Optional manual override of the PhpEditor WebSocket URL. */
    PHP_EDITOR_WS_URL?: string;
    /** Test hook: the editor component instance. */
    phpEditor?: PhpEditorInstance;
    /** Test hook: the Monaco namespace owned by devsense-php-editor (Playwright uses `monaco.editor.getEditors()`). */
    monaco?: PhpEditorInstance['monaco'];
  }
}

export {};
