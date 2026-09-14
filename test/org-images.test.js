import test from 'node:test';
import assert from 'node:assert/strict';
import { renderOrg } from '../src/org.js';
import { MAX_IMAGE_LINKS } from '../electron/formats.cjs';

test('Org local image links produce placeholders and verified source positions', () => {
  const source = '#+title: Café 日本語\n[[file:images/chart.png]]\n[[./photo.JPG]]\n[[../diagram.svg]]\n[[file:photo.png][A description]]\n[[https://example.com/photo.png]]\n#+begin_src org\n[[file:code.png]]\n#+end_src';
  const result = renderOrg(source);
  assert.equal(result.images.length, 3);
  for (const image of result.images) assert.equal(source.slice(image.start, image.end), image.reference);
  assert.match(result.html, /data-image-id="0"/);
  assert.doesNotMatch(result.html, /<img\b/);
  assert.match(result.html, /href="https:\/\/example.com\/photo.png"/);
  assert.match(result.html, /A description/);
  const many = renderOrg('[[file:photo.png]]\n'.repeat(MAX_IMAGE_LINKS + 1));
  assert.equal(many.images.length, MAX_IMAGE_LINKS);
  assert.match(many.html, /Image limit reached/);
});

