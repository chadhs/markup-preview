import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createImageFixture, fixturePng } from './image-fixture.mjs';

export async function checkRemoteImages(window, directory, prefix) {
  const fixture = await createImageFixture();
  const rendererRequests = [];
  const onRequest = (request) => { if (/^https?:/.test(request.url())) rendererRequests.push(request.url()); };
  window.on('request', onRequest);
  let closed = false;
  try {
    await writeFile(path.join(directory, 'remote-local.png'), fixturePng);
    for (const format of ['org', 'markdown']) {
      const file = path.join(directory, `remote-images.${format === 'org' ? 'org' : 'md'}`);
      const imageUrl = `${fixture.origin}/${format === 'org' ? 'image.png' : 'image'}?size=2#view`;
      const image = (target, alt = 'Remote chart') => format === 'org' ? `[[${target}]]` : `![${alt}](${target})`;
      const title = `Remote images ${format}`;
      const source = [
        format === 'org' ? `#+title: ${title}` : `# ${title}`,
        image('./remote-local.png', 'Local image'),
        image(imageUrl),
        image(`${fixture.origin}/safe.svg`, 'Remote SVG'),
        image(`${fixture.origin}/redirect.png`, 'Redirected image'),
        image(`${fixture.origin}/missing.png`),
        image(`${fixture.origin}/invalid.png`),
        format === 'org' ? image(imageUrl) : '[![Reference][chart]](https://example.invalid/page)',
        format === 'org' ? `[[${fixture.origin}/described.png][Keep this as a link]]` : `[chart]: ${imageUrl}`,
        format === 'org' ? `#+begin_src org\n${image(`${fixture.origin}/code.png`)}\n#+end_src` : `\`\`\`md\n${image(`${fixture.origin}/code.png`)}\n\`\`\``,
        format === 'org' ? `#+begin_export html\n<img src="${fixture.origin}/html.png" onerror="globalThis.compromised=true">\n#+end_export` : `<img src="${fixture.origin}/html.png" onerror="globalThis.compromised=true">`,
        'The document stays readable.',
      ].join('\n\n');
      const start = fixture.requests.length;
      await writeFile(file, source);
      await window.evaluate((file) => window.markupPreview.openPath(file), file);
      await expect(window.locator('#document-title')).toHaveText(title);
      await expect(window.locator('.image-preview[data-loaded="true"]')).toHaveCount(5);
      await expect(window.locator('.image-preview[data-loaded="false"]')).toHaveCount(2);
      await expect(window.locator('[data-image-id="4"]')).toContainText('HTTP 404');
      await expect(window.locator('[data-image-id="5"]')).toContainText('invalid image');
      expect(await window.locator('#content img').evaluateAll((images) => images.every((image) => image.src.startsWith('data:image/') && image.naturalWidth > 0))).toBe(true);
      expect(await window.evaluate(() => window.compromised)).toBeUndefined();
      await expect(window.locator('#content')).toContainText('The document stays readable.');
      await expect(window.locator('#error')).toBeHidden();
      if (format === 'markdown') {
        await expect(window.locator('[data-image-id="6"] img')).toHaveAttribute('alt', 'Reference');
        await expect(window.locator('a[href="https://example.invalid/page"] img')).toHaveCount(1);
      }
      const expected = [`/${format === 'org' ? 'image.png' : 'image'}?size=2`, '/safe.svg', '/redirect.png', '/image', '/missing.png', '/invalid.png'];
      expect(fixture.requests.slice(start).map(({ url }) => url)).toEqual(expected);
      for (const { headers } of fixture.requests.slice(start)) {
        expect(headers.cookie).toBeUndefined();
        expect(headers.authorization).toBeUndefined();
        expect(headers.referer).toBeUndefined();
      }
      await window.screenshot({ path: `test-results/${prefix}-remote-images-${format}.png` });
      // A save must discard cached successes and failures and fetch this revision again.
      await writeFile(file, source + '\n\nSaved remote images.');
      await expect(window.locator('#content')).toContainText('Saved remote images.');
      await expect(window.locator('.image-preview[data-loaded="true"]')).toHaveCount(5);
      await expect(window.locator('.image-preview[data-loaded="false"]')).toHaveCount(2);
      expect(fixture.requests.slice(start).map(({ url }) => url)).toEqual([...expected, ...expected]);
      if (format === 'markdown') {
        await fixture.close(); closed = true;
        await writeFile(file, source + '\n\nOffline document stays readable.');
        await expect(window.locator('#content')).toContainText('Offline document stays readable.');
        await expect(window.locator('.image-preview[data-loaded="true"]')).toHaveCount(1);
        await expect(window.locator('.image-preview[data-loaded="false"]')).toHaveCount(6);
        await expect(window.locator('#error')).toBeHidden();
      }
    }
    // Neither SVG subresources, raw HTML, code nor described Org links reached the server.
    expect(fixture.requests.some(({ url }) => /nested|html|code|described/.test(url))).toBe(false);
    expect(rendererRequests).toEqual([]);
    console.log('Remote image smoke passed: Org and Markdown display, references, linked images, redirects, SVG isolation, cache, saves, and offline placeholders.');
  } finally {
    window.off('request', onRequest);
    if (!closed) await fixture.close();
  }
}
