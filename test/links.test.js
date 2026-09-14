import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolveDocumentLink, openDocumentLink } from '../electron/links.cjs';
import { createSessions } from '../electron/sessions.cjs';
import { renderDocument, resolveAnchor } from '../src/documents.js';

test('local links resolve paths and Org/Markdown heading targets without external protocols', () => {
  const doc = '/notes/source.md';
  assert.deepEqual(resolveDocumentLink(doc, '../café%20日本語.MD#heading'), { file: '/café 日本語.MD', fragment: { kind: 'anchor', value: 'heading' } });
  assert.deepEqual(resolveDocumentLink(doc, 'file:other.org::*Some heading'), { file: '/notes/other.org', fragment: { kind: 'heading', value: 'Some heading' } });
  assert.equal(resolveDocumentLink(doc, 'file:other.org::#custom').fragment.value, 'custom');
  assert.equal(resolveDocumentLink(doc, '~/notes.md').file, path.join(os.homedir(), 'notes.md'));
  assert.equal(resolveDocumentLink(doc, pathToFileURL('/notes/café 日本語.markdown').href).file, '/notes/café 日本語.markdown');
  for (const target of ['https://example.com/a.md', 'javascript:bad.md', '//server/a.md', 'file://server/a.md', '%2F%2Fserver/a.md', 'file:other.org::42', 'secret.txt', 'a%00.md']) assert.throws(() => resolveDocumentLink(doc, target), /supported|only|local|Invalid/i, target);
});

test('Org and Markdown links navigate both formats, reuse tabs and preserve failures', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markup-preview-links-'));
  const states = [];
  const sessions = createSessions({ watch: () => () => {}, changed: (state) => states.push(state) });
  try {
    const org = path.join(directory, 'one.org'), markdown = path.join(directory, 'two.md');
    await writeFile(org, '#+title: Org\n* Destination\n:PROPERTIES:\n:CUSTOM_ID: custom\n:END:\n[[file:two.md#destination][Markdown]]\n[[file:missing.md][Missing]]');
    await writeFile(markdown, '# Markdown\n\n## Destination\n\n[Org](one.org::#custom) [Heading](one.org::*Destination) [Alias](alias.org)');
    await symlink(org, path.join(directory, 'alias.org'));
    await sessions.openMany([org]);
    const orgId = sessions.active().id;
    async function click(index) {
      const doc = sessions.active(), parsed = renderDocument(doc);
      return openDocumentLink(sessions, doc.id, doc.revision, parsed.links[index]);
    }
    await click(0);
    assert.equal(sessions.active().format, 'markdown');
    assert.equal(states.at(-1).navigation.fragment.value, 'destination');
    assert.equal(resolveAnchor(renderDocument(sessions.active()), states.at(-1).navigation.fragment), 'md-heading-destination');
    const markdownId = sessions.active().id;
    await click(0);
    assert.equal(sessions.active().id, orgId);
    assert.equal(resolveAnchor(renderDocument(sessions.active()), states.at(-1).navigation.fragment), 'org-custom');
    assert.equal(sessions.snapshot().tabs.length, 2);
    const failed = await click(1);
    assert.equal(sessions.active().id, orgId);
    assert.match(failed.openError, /missing.md/);
    sessions.activate(markdownId); await click(1);
    assert.equal(states.at(-1).navigation.fragment.kind, 'heading');
    sessions.activate(markdownId); await click(2);
    assert.equal(sessions.active().id, orgId);
    assert.equal(states.at(-1).navigation, null);
    await assert.rejects(openDocumentLink(sessions, markdownId, 1, {}), /changed/);
    await assert.rejects(openDocumentLink(sessions, orgId, 999, {}), /changed/);
    await assert.rejects(openDocumentLink(sessions, orgId, 1, { start: 0, end: 1 }), /Invalid/);
  } finally { sessions.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test('a queued local-link open cannot override a later tab selection', async () => {
  let finishRead, started;
  const reading = new Promise((resolve) => { started = resolve; });
  const document = (file) => ({ path: file, name: path.basename(file), format: 'markdown', source: '[Target](target.md)', size: 19, modified: 1 });
  const sessions = createSessions({
    read: async (file) => {
      if (file === '/notes/target.md') { started(); await new Promise((resolve) => { finishRead = resolve; }); }
      return document(file);
    }, canonicalize: async (file) => file, watch: () => () => {},
  });
  try {
    await sessions.openMany(['/notes/other.md', '/notes/source.md']);
    const otherId = sessions.snapshot().tabs[0].id, doc = sessions.active();
    const opening = openDocumentLink(sessions, doc.id, doc.revision, renderDocument(doc).links[0]);
    await reading;
    sessions.activate(otherId);
    finishRead();
    await opening;
    assert.equal(sessions.active().id, otherId);
    assert.equal(sessions.snapshot().tabs.length, 2);
  } finally { sessions.dispose(); }
});
