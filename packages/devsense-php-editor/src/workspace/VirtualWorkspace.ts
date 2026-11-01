/**
 * Virtual workspace schema management.
 *
 * Each WebSocket client gets a unique `{id}` and a dedicated virtual workspace
 * with schema `untitled-workspace-{id}://`. Documents within that workspace use
 * URIs like `untitled-workspace-{id}://untitled.php`.
 */
export interface VirtualWorkspaceOptions {
  /** Base path within the virtual workspace for documents (default: 'untitled'). */
  basePath?: string;
}

export class VirtualWorkspace {
  private readonly clientId: string;
  private readonly scheme: string;

  constructor(clientId: string, options: VirtualWorkspaceOptions = {}) {
    this.clientId = clientId;
    this.scheme = `untitled-workspace-${clientId}`;
  }

  /** The workspace root URI, e.g. `untitled-workspace-{id}://`. */
  get rootUri(): string {
    return `${this.scheme}://`;
  }

  /** Build a document URI within this workspace, e.g. `untitled-workspace-{id}://untitled.php`. */
  documentUri(documentName = 'untitled.php'): string {
    return `${this.rootUri}${documentName}`;
  }

  /** The workspace scheme (without `://`), e.g. `untitled-workspace-{id}`. */
  get workspaceScheme(): string {
    return this.scheme;
  }

  /** Test whether a URI belongs to this workspace. */
  owns(uri: string): boolean {
    return uri.startsWith(`${this.rootUri}`);
  }

  /** Extract the document name from a workspace URI, e.g. `untitled.php`. */
  documentName(uri: string): string | null {
    if (!this.owns(uri)) return null;
    return uri.slice(this.rootUri.length) || null;
  }
}
