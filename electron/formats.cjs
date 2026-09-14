const MAX_IMAGE_LINKS = 100;
const DOCUMENT_EXTENSIONS = ['org', 'md', 'markdown'];
function documentFormat(file) {
  if (typeof file !== 'string') return null;
  const extension = /\.([^./\\]+)$/.exec(file)?.[1].toLowerCase();
  return extension === 'org' ? 'org' : ['md', 'markdown'].includes(extension) ? 'markdown' : null;
}
const documentTitle = (name) => name.replace(/\.(?:org|md|markdown)$/i, '');
module.exports = { MAX_IMAGE_LINKS, DOCUMENT_EXTENSIONS, documentFormat, documentTitle };
