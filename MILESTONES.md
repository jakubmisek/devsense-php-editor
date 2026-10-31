# Online PHP Editor — Milestones & Development Cycle

**PM:** devsense-pm
**Owner:** gateway-owner
**Repo:** git@github.com:jakubmisek/devsense-php-editor.git
**Date:** 2026-10-31

## Milestone M1 — Project Setup & Specification

**Goal:** Initialize the repository, write SPEC.md and MILESTONES.md, define git workflow.

**Deliverables:**
- Repo cloned/initialized at `devsense-php-editor`
- `SPEC.md` committed (full specification)
- `MILESTONES.md` committed (this file)
- `.gitignore`, `README.md`, license (MIT)
- Monorepo structure decided (single repo with `packages/`)
- Subagent spawning pattern defined (objectives, write scopes, verification)

**Exit criteria:** `git log` shows SPEC.md + MILESTONES.md committed on master.

---

## Milestone M2 — `devsense-php-editor` Core

**Goal:** `PhpEditor` class, single `devsense-php-ls` lifecycle, WebSocket server, RPC router.

**Deliverables:**
- `packages/devsense-php-editor/package.json` (name, main, types, bin, deps: `devsense-php-ls`, `monaco-editor` as peer/transient, `ws`)
- `src/index.ts` exporting `PhpEditor`
- `src/PhpEditor.ts` — start/stop/getPort/getUrl, LS spawn via `languageServerPath()`
- `src/server/LsServer.ts` — manage LS process (stdio), initialize/shutdown/exit handshake
- `src/server/WsServer.ts` — WebSocket server, per-client `{id}` assignment
- `src/server/Router.ts` — route RPC between WS clients and LS
- `src/lsp/client.ts` — JSON-RPC over stdio to devsense-php-ls
- `src/workspace/VirtualWorkspace.ts` — `untitled-workspace-{id}://` schema management
- License key via `DEVSENSE_PHP_LS_LICENSE` → `initializationOptions."0"`

**Exit criteria:** `npm run build` succeeds; `PhpEditor` starts LS, accepts WS connections, echoes `initialize` round-trip.

---

## Milestone M3 — LSP Providers

**Goal:** All language feature providers wired through WS router to devsense-php-ls.

**Providers (each maps Monaco provider → LSP request):**
1. Completion → `textDocument/completion`
2. Hover → `textDocument/hover`
3. Signature Help → `textDocument/signatureHelp`
4. Definition → `textDocument/definition`
5. References → `textDocument/references`
6. Document Symbols → `textDocument/documentSymbol`
7. Code Actions → `textDocument/codeAction`
8. Formatting → `textDocument/formatting`
9. Range Formatting → `textDocument/rangeFormatting`
10. On-Type Formatting → `textDocument/onTypeFormatting`
11. Semantic Tokens → `textDocument/semanticTokens/full`
12. Inline Completion → `textDocument/inlineCompletion`
13. Inlay Hints → `textDocument/inlayHint`
14. Code Lens → `textDocument/codeLens`
15. Rename → `textDocument/rename`

**Diagnostics:** `textDocument/publishDiagnostics` routed by `textDocument.uri` to owning WS client.

**Exit criteria:** All providers registered; unit-level verification that each LSP request/response round-trips through WS router.

---

## Milestone M4 — `devsense-php-editor-sampleweb`

**Goal:** Sample web app with Monaco editor, theme, diagnostics panel, virtual PHP doc.

**Deliverables:**
- `packages/devsense-php-editor-sampleweb/package.json` — depends on `devsense-php-editor` ONLY (NOT `monaco-editor` directly)
- `index.html` — single HTML entry
- `src/main.ts` — entry: create editor, connect WS
- `src/editor.ts` — Monaco editor setup + provider wiring
- `src/theme.ts` — light/dark/automatic theme switching
- `src/diagnostics.ts` — bottom collapsible panel with current doc diagnostics
- `src/ws-client.ts` — WebSocket client to PhpEditor server
- Build tool: vite (or webpack)
- Top bar title: "DEVSENSE PHP Editor Playground"
- Content area: Monaco editor with `untitled-workspace-{id}://untitled`
- Bottom collapsible panel: diagnostics for current virtual document

**Exit criteria:** `npm run build` succeeds; sampleweb loads in browser; editor opens with virtual doc; features work.

---

## Milestone M5 — Playwright Tests

**Goal:** E2E tests for every specified feature.

**Test files:**
- `packages/devsense-php-editor-sampleweb/tests/editor.spec.ts` — editor loads, types PHP, completions appear
- `packages/devsense-php-editor-sampleweb/tests/diagnostics.spec.ts` — diagnostics panel shows errors/warnings
- `packages/devsense-php-editor-sampleweb/tests/theme.spec.ts` — light/dark/automatic switching
- `packages/devsense-php-editor-sampleweb/tests/features.spec.ts` — hover, definition, references, formatting, rename, code actions, inlay hints, code lens, semantic tokens, inline completion

**Exit criteria:** `npx playwright test` passes all tests.

---

## Milestone M6 — Demo & Verification

**Goal:** Open sampleweb in Chromium, screenshot, post to Discord #devsense-pm.

**Deliverables:**
- Chromium launched with sampleweb running
- Screenshot saved (e.g. `screenshot-sampleweb.png`)
- Discord message posted to #devsense-pm with screenshot + short summary

**Exit criteria:** Screenshot delivered; Discord post confirmed.

---

## Development Cycle (PM Loop)

1. PM writes SPEC.md/MILESTONES.md, commits to repo.
2. PM spawns subagents per package/feature (objective + write scope + verification).
3. Subagents implement, commit directly or create PRs.
4. PM reviews/merges PRs or accepts direct commits.
5. After each milestone: verify build, run tests, update MEMORY.md.
6. On rate-limit: wait 30 min, retry; set automation wake-up check if needed.
