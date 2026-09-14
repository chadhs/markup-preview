import formats from '../electron/formats.cjs';
import { parse } from 'orga';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { frontmatter } from 'micromark-extension-frontmatter';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { orgImageTarget } from '../electron/org-image-links.mjs';
import { orgMetadata, markdownMetadata } from './metadata.js';
const { MAX_IMAGE_LINKS } = formats;

export const plainText = (node) => node.value ?? node.alt ?? (node.children || []).map(plainText).join('');
export function localImageUrl(target) {
  if (typeof target !== 'string' || target.length > 8192) return false;
  const local = target.replace(/^file:/i, '');
  return !/^[a-z][a-z0-9+.-]*:/i.test(local) && !local.startsWith('//')
    && /\.(?:png|jpe?g|gif|webp|svg)$/i.test(local);
}
export const externalUrl = (url) => /^(?:https?:\/\/|mailto:)/i.test(url);
export const localLinkUrl = (url) => typeof url === 'string' && url.length <= 8192
  && !url.startsWith('#') && (!/^[a-z][a-z0-9+.-]*:/i.test(url.split('::')[0]) || /^file:/i.test(url));

// No DOM or highlighting dependencies: this module is also bundled for Electron.
export function analyzeDocument({ source, format }) {
  if (!['org', 'markdown'].includes(format)) throw new Error('Unsupported document format.');
  const org = format === 'org' ? orgMetadata(source) : null;
  const tree = format === 'org' ? parse(org.source)
    : fromMarkdown(source, { extensions: [gfm(), frontmatter(['yaml', 'toml'])], mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown(['yaml', 'toml'])] });
  const images = [], diagrams = [], links = [];
  const definitions = new Map(), nodes = new WeakMap();
  function visit(node, callback) { callback(node); for (const child of node.children || []) visit(child, callback); }
  visit(tree, (node) => {
    if (node.type === 'definition' && !definitions.has(node.identifier)) definitions.set(node.identifier, node);
  });
  let diagramCharacters = 0;
  visit(tree, (node) => {
    const start = node.position?.start.offset, end = node.position?.end.offset;
    const reference = source.slice(start, end);
    const descriptor = { start, end, reference };
    let image, link, code;
    if (format === 'org') {
      if (node.type === 'link') {
        image = orgImageTarget(reference);
        // Keep the complete file target, including Org :: search suffixes.
        link = /^\[\[([^\]\r\n]+)/.exec(reference)?.[1];
        if (node.path?.protocol === 'internal' && !/\.(?:org|md|markdown)(?:#|::|$)/i.test(link || '')) link = undefined;
      }
      if (node.type === 'block' && node.name.toLowerCase() === 'src' && node.params?.[0]?.toLowerCase() === 'mermaid') code = node.value;
    } else {
      const definition = definitions.get(node.identifier);
      if (node.type === 'image' || node.type === 'imageReference') {
        const target = node.url ?? definition?.url;
        if (localImageUrl(target) || /^file:\/\//i.test(target || '')) image = target;
      }
      if (node.type === 'link' || node.type === 'linkReference') link = node.url ?? definition?.url;
      if (node.type === 'code' && node.lang?.toLowerCase() === 'mermaid') code = node.value;
    }
    const indexed = {};
    if (image && images.length < MAX_IMAGE_LINKS && reference.length <= 8192) {
      indexed.image = { ...descriptor, id: images.length, target: image, label: image,
        ...(format === 'markdown' ? { alt: node.alt || '' } : {}) };
      images.push(indexed.image);
    }
    if (!image && localLinkUrl(link)) {
      indexed.link = { ...descriptor, id: links.length, target: link };
      links.push(indexed.link);
    }
    if (code !== undefined) {
      const error = diagrams.length >= 20 ? 'Diagram limit reached: 20 per document.'
        : code.length > 20000 || reference.length > 22000 ? 'Diagram exceeds 20,000 characters.'
        : diagramCharacters + code.length > 100000 ? 'Diagram source exceeds 100,000 characters per document.' : '';
      indexed.diagram = error ? { error, source: code } : { ...descriptor, id: diagrams.length, source: code };
      if (!error) { diagrams.push(indexed.diagram); diagramCharacters += code.length; }
    }
    nodes.set(node, indexed);
  });
  return { tree, images, diagrams, links, definitions, nodes, metadata: org?.metadata ?? markdownMetadata(tree) };
}
