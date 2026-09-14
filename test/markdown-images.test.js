import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createImageReader } from '../electron/images.cjs';
import { renderMarkdown } from '../src/markdown.js';

test('Markdown inline and reference images load only verified local image nodes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'markup-preview-md-images-'));
  try {
    await writeFile(path.join(directory, 'chart.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const source = '![Inline](chart.svg)\n\n![Reference][chart]\n\n[chart]: chart.svg\n\n```md\n![Fake](chart.svg)\n```\n\n![Host](file://remote/chart.svg)';
    const doc = { path: path.join(directory, 'notes.md'), source };
    const read = createImageReader(doc), parsed = renderMarkdown(source);
    for (const image of parsed.images.slice(0, 2)) assert.match((await read(image)).dataUrl, /^data:image\/svg\+xml;base64,/);
    assert.match((await read(parsed.images[2])).error, /local/);
    const reference = '![Fake](chart.svg)', start = source.indexOf(reference);
    assert.match((await read({ start, end: start + reference.length, reference })).error, /Invalid/);
    const updated = { ...doc, source: source.replace('[chart]: chart.svg', '[chart]: missing.svg') };
    assert.match((await createImageReader(updated)(parsed.images[1])).error, /not found/);
    const unchanged = await read(parsed.images[1]);
    assert.ok(unchanged.dataUrl);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
