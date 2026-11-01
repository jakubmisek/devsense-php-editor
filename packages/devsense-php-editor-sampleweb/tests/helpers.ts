import { Page, expect } from '@playwright/test';

export const EDITOR = '.monaco-editor';

/** Open the playground and wait until the editor is visible and the LSP handshake has run. */
export async function openPlayground(page: Page): Promise<void> {
  const portRes = await page.request.fetch('/php-editor-port', { failOnStatusCode: false });
  expect(portRes.ok(), 'PhpEditor backend port file (/php-editor-port) must be served').toBe(true);
  await page.goto('/');
  await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => (window as any).monaco?.editor?.getEditors?.().length > 0);
  await page.waitForTimeout(1500); // initialize (faked) + didOpen
}

/** Replace the whole document text via the Monaco model (no auto-closing brackets). */
export async function setText(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => (window as any).monaco.editor.getEditors()[0].getModel().setValue(t), text);
}

export async function getText(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).monaco.editor.getEditors()[0].getValue());
}

/** Place the caret at the end of the document and focus the editor. */
export async function caretToEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const ed = (window as any).monaco.editor.getEditors()[0];
    const m = ed.getModel();
    const line = m.getLineCount();
    ed.setPosition({ lineNumber: line, column: m.getLineMaxColumn(line) });
    ed.focus();
  });
}

/** Run a Monaco editor action (e.g. editor.action.formatDocument) and wait for it. */
export async function runAction(page: Page, id: string): Promise<void> {
  await page.evaluate((a) => (window as any).monaco.editor.getEditors()[0].getAction(a).run(), id);
}
