const path = require('node:path');
const os = require('node:os');
const { fileURLToPath } = require('node:url');
const { documentFormat } = require('./formats.cjs');
const { documentResource } = require('./resource-index.cjs');

function resolveDocumentLink(documentPath, value) {
  if (typeof value !== 'string' || value.length > 8192 || value.includes('\0')) throw new Error('Invalid document link.');
  let target = value, fragment = null;
  const orgSearch = target.indexOf('::');
  if (orgSearch !== -1) {
    const search = target.slice(orgSearch + 2); target = target.slice(0, orgSearch);
    if (search.startsWith('#')) fragment = { kind: 'anchor', value: search.slice(1) };
    else if (search.startsWith('*')) fragment = { kind: 'heading', value: search.replace(/^\*+\s*/, '') };
    else throw new Error('Only heading and custom-ID link targets are supported.');
  } else {
    const hash = target.indexOf('#');
    if (hash !== -1) { fragment = { kind: 'anchor', value: target.slice(hash + 1) }; target = target.slice(0, hash); }
  }
  const decode = (value) => { try { return decodeURIComponent(value); } catch { return value; } };
  if (fragment) fragment.value = decode(fragment.value);
  let file;
  if (/^file:\/\//i.test(target)) {
    const url = new URL(target);
    if (url.hostname && url.hostname !== 'localhost') throw new Error('Only local document links are supported.');
    file = fileURLToPath(url);
  } else {
    target = decode(target.replace(/^file:/i, ''));
    if (target.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.includes('\0')) throw new Error('Only local document links are supported.');
    file = target.startsWith('~/') ? path.join(os.homedir(), target.slice(2)) : path.resolve(path.dirname(documentPath), target);
  }
  if (!documentFormat(file)) throw new Error('Links can open only .org, .md, or .markdown documents.');
  return { file, fragment };
}

async function openDocumentLink(sessions, id, revision, reference) {
  const doc = sessions.active();
  if (!doc || doc.id !== id || doc.revision !== revision) throw new Error('The document changed.');
  const resource = await documentResource(doc, 'links', reference);
  if (sessions.active() !== doc) throw new Error('The document changed.');
  const { file, fragment } = resolveDocumentLink(doc.path, resource.target);
  return sessions.openMany([file], { fragment, isCurrent: () => sessions.active() === doc });
}
module.exports = { resolveDocumentLink, openDocumentLink };
