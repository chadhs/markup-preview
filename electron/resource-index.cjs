const { existsSync } = require('node:fs');
const path = require('node:path');
const { documentFormat } = require('./formats.cjs');
const indexes = new WeakMap();
let analyzer;
async function documentIndex(doc) {
  if (!indexes.has(doc)) {
    analyzer ??= existsSync(path.join(__dirname, '../src/document-analysis.js'))
      ? import('../src/document-analysis.js') : Promise.resolve(require('../dist/document-analysis.cjs'));
    indexes.set(doc, analyzer.then(({ analyzeDocument }) => {
      const { images, diagrams, links } = analyzeDocument({ source: doc.source, format: doc.format ?? documentFormat(doc.path) });
      return { images, diagrams, links };
    }));
  }
  return indexes.get(doc);
}
async function documentResource(doc, kind, request) {
  if (!request || !Number.isSafeInteger(request.start) || !Number.isSafeInteger(request.end)
    || request.start < 0 || request.end <= request.start || request.end > doc.source.length) throw new Error('Invalid document reference.');
  const index = await documentIndex(doc);
  const resource = index[kind].find((item) => item.start === request.start && item.end === request.end);
  if (!resource || (request.reference !== undefined && resource.reference !== request.reference)) throw new Error('Invalid document reference.');
  return resource;
}
module.exports = { documentIndex, documentResource };
