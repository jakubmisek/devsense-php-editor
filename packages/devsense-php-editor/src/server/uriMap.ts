/**
 * devsense-php-ls enables textDocument/rename and prepareRename only for `file:` documents. For any
 * other scheme it treats every symbol as built-in and answers rename with -32803 "Cannot rename a
 * built-in symbol". Opening every document as `file:` is not an option: all `file:` documents form
 * one project, so clients would see each other's functions and classes (completion, definition, ...),
 * while `untitled-workspace-{id}://` documents stay isolated.
 *
 * So for a rename request only, the Router opens a short-lived "shadow" copy of the client's document
 * as `file:///untitled-workspace-{id}/path`, sends the request against it, maps the URIs in the
 * result back and closes the shadow. Clients never see the `file:` form.
 */
const CLIENT_RE = /^untitled-workspace-([A-Za-z0-9_-]+):\/\/\/?/;
const LS_RE = /^file:\/\/\/untitled-workspace-([A-Za-z0-9_-]+)(\/|$)/;

export function clientUriToLs(uri: string): string {
  return uri.replace(CLIENT_RE, (_m, id: string) => `file:///untitled-workspace-${id}/`);
}

export function lsUriToClient(uri: string): string {
  return uri.replace(LS_RE, (_m, id: string) => `untitled-workspace-${id}://`);
}

function deepMap(value: unknown, f: (s: string) => string): unknown {
  if (typeof value === 'string') return f(value);
  if (Array.isArray(value)) return value.map((v) => deepMap(v, f));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    // Keys too: WorkspaceEdit.changes is keyed by URI.
    for (const [k, v] of Object.entries(value)) out[f(k)] = deepMap(v, f);
    return out;
  }
  return value;
}

export function toLsUris<T>(message: T): T { return deepMap(message, clientUriToLs) as T; }
export function toClientUris<T>(message: T): T { return deepMap(message, lsUriToClient) as T; }

/** True for a shadow document URI (`file:///untitled-workspace-{id}/...`). */
export function isShadowUri(uri: string): boolean { return LS_RE.test(uri); }
/** True for a client virtual document URI (`untitled-workspace-{id}://...`). */
export function isVirtualUri(uri: string): boolean { return CLIENT_RE.test(uri); }

type Change = { text: string; range?: { start: { line: number; character: number }; end: { line: number; character: number } } };

function offsetAt(text: string, pos: { line: number; character: number }): number {
  let off = 0;
  for (let l = 0; l < pos.line; l++) {
    const nl = text.indexOf('\n', off);
    if (nl < 0) return text.length;
    off = nl + 1;
  }
  const eol = text.indexOf('\n', off);
  return Math.min(off + pos.character, eol < 0 ? text.length : eol);
}

/** Apply textDocument/didChange contentChanges (full or incremental, UTF-16 offsets) to a text. */
export function applyContentChanges(text: string, changes: Change[]): string {
  for (const c of changes) {
    if (!c.range) { text = c.text; continue; }
    const a = offsetAt(text, c.range.start), b = offsetAt(text, c.range.end);
    text = text.slice(0, a) + c.text + text.slice(b);
  }
  return text;
}
