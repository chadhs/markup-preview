import formats from '../electron/formats.cjs';
import { renderOrg } from './org.js';
import { renderMarkdown } from './markdown.js';
export function renderDocument(doc) {
  const format = doc.format ?? formats.documentFormat(doc.name);
  const title = formats.documentTitle(doc.name);
  if (format === 'org') return renderOrg(doc.source, title);
  if (format === 'markdown') return renderMarkdown(doc.source, title);
  throw new Error('Unsupported document format.');
}
export { resolveAnchor } from './anchors.js';
