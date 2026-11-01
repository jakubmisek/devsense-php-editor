/** Unit tests: virtual URI <-> file: URI mapping used between Router and devsense-php-ls. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientUriToLs, lsUriToClient, toLsUris, toClientUris, applyContentChanges } from '../src/server/uriMap';

test('client URIs map to file: URIs and back', () => {
  assert.equal(clientUriToLs('untitled-workspace-client-1://untitled.php'), 'file:///untitled-workspace-client-1/untitled.php');
  assert.equal(clientUriToLs('untitled-workspace-client-1://'), 'file:///untitled-workspace-client-1/');
  assert.equal(lsUriToClient('file:///untitled-workspace-client-1/untitled.php'), 'untitled-workspace-client-1://untitled.php');
  assert.equal(lsUriToClient('file:///untitled-workspace-client-1/'), 'untitled-workspace-client-1://');
  assert.equal(lsUriToClient('file:///home/x.php'), 'file:///home/x.php');
  assert.equal(clientUriToLs('file:///home/x.php'), 'file:///home/x.php');
});

test('deep mapping rewrites values and WorkspaceEdit.changes keys, not document text', () => {
  const text = '<?php echo "untitled-workspace-a://x";';
  const msg = { params: { textDocument: { uri: 'untitled-workspace-a://x.php', text } } };
  assert.deepEqual(toLsUris(msg), { params: { textDocument: { uri: 'file:///untitled-workspace-a/x.php', text } } });
  const edit = { result: { changes: { 'file:///untitled-workspace-a/x.php': [{ newText: 'y' }] } } };
  assert.deepEqual(toClientUris(edit), { result: { changes: { 'untitled-workspace-a://x.php': [{ newText: 'y' }] } } });
});

test('applyContentChanges handles full and incremental changes', () => {

  assert.equal(applyContentChanges('a', [{ text: '<?php\n$x = 1;\n' }]), '<?php\n$x = 1;\n');
  const t = applyContentChanges('<?php\n$x = 1;\n', [{ range: { start: { line: 1, character: 1 }, end: { line: 1, character: 2 } }, text: 'count' }]);
  assert.equal(t, '<?php\n$count = 1;\n');
  assert.equal(applyContentChanges(t, [{ range: { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } }, text: 'echo 1;' }]), '<?php\n$count = 1;\necho 1;');
});
