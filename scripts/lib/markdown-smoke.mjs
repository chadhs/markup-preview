import { expect } from '@playwright/test';
import { writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { setAppearance } from './appearance-smoke.mjs';

export async function checkMarkdown(app, window, directory, prefix, appArgs, profileArg, env) {
  const file = path.join(directory, 'markdown café 日本語.MD');
  const org = path.join(directory, 'linked.org');
  const other = path.join(directory, 'other.markdown');
  const source = '# Markdown notebook\n\n**Readable** ~~old~~ text and a note[^n].\n\n- [x] Done\n- [ ] Later\n\n| Name | Value |\n| --- | ---: |\n| one | 1 |\n\n![Local chart][image]\n\n[image]: ./markdown-chart.svg\n\n```js\nconst answer = 42;\n```\n\n> ~~~mermaid\n> flowchart LR\n> A-->B\n> ~~~\n\n[Org heading](linked.org::#target) [Missing](missing.md) [Missing heading](linked.org::#absent)\n\n## Destination\n\n[Top](#markdown-notebook)\n\n[^n]: A footnote.\n\n<script>globalThis.markdownCompromised = true</script>\n\n![Remote](https://tracker.invalid/pixel.png)';
  await writeFile(file, source);
  await writeFile(other, '# Another Markdown document\n\n[Back](./markdown%20caf%C3%A9%20%E6%97%A5%E6%9C%AC%E8%AA%9E.MD#destination)');
  await writeFile(org, '#+title: Linked Org\n* Target\n:PROPERTIES:\n:CUSTOM_ID: target\n:END:\n[[file:markdown café 日本語.MD#destination][Back to Markdown]]');
  await writeFile(path.join(directory, 'markdown-chart.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="#268bd2"/></svg>');
  const remoteRequests = [];
  const onRequest = (request) => { if (/^https?:/.test(request.url())) remoteRequests.push(request.url()); };
  window.on('request', onRequest);
  try {
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async (options) => { globalThis.markdownPicker = options; return { canceled: false, filePaths: [file] }; }; }, file);
    await window.locator('#open').click();
    await expect(window.locator('#document-title')).toHaveText('Markdown notebook');
    await expect(window.locator('#mode-label')).toHaveText('MARKDOWN DOCUMENT');
    await expect(window.locator('#format-label')).toHaveText('Markdown');
    await expect(window.locator('#content strong')).toHaveText('Readable');
    await expect(window.locator('#content input[type=checkbox]')).toHaveCount(2);
    await expect(window.locator('#content input[type=checkbox]').first()).toBeDisabled();
    await expect(window.locator('#content table')).toHaveCount(1);
    await expect(window.locator('.image-preview img')).toHaveAttribute('alt', 'Local chart');
    await expect(window.locator('.code-block .hljs-keyword')).toHaveText('const');
    await expect(window.locator('.diagram')).toHaveAttribute('data-rendered', 'true', { timeout: 15000 });
    await expect(window.locator('.footnotes')).toContainText('A footnote.');
    await expect(window.locator('#content script')).toHaveCount(0);
    expect(await window.evaluate(() => window.markdownCompromised)).toBeUndefined();
    for (const [mode, theme] of [['light', 'light'], ['dark', 'dark'], ['light', 'solarized-light'], ['dark', 'solarized-dark']]) {
      await setAppearance(window, { mode, [mode]: theme });
      await window.keyboard.press('Escape');
      await expect(window.locator('.diagram')).toHaveAttribute('data-rendered', 'true');
      await window.screenshot({ path: `test-results/${prefix}-markdown-${theme}.png` });
    }
    await window.locator('#find-button').click();
    await window.locator('#search').fill('Readable');
    await expect(window.locator('#search-count')).toHaveText('1 / 1');
    await window.locator('#close-search').click();
    await window.locator('#source-tab').click();
    await expect(window.locator('#mode-label')).toHaveText('MARKDOWN SOURCE · READ ONLY');
    expect(await window.locator('#source').textContent()).toBe(source);
    await window.locator('#preview-tab').click();
    await window.getByRole('link', { name: 'Org heading', exact: true }).click();
    await expect(window.locator('#document-title')).toHaveText('Linked Org');
    await expect(window.locator('#mode-label')).toHaveText('ORG DOCUMENT');
    await expect(window.locator('#error')).toBeHidden();
    await window.getByRole('link', { name: 'Back to Markdown' }).click();
    await expect(window.locator('#document-title')).toHaveText('Markdown notebook');
    await expect(window.locator('#error')).toBeHidden();
    await window.getByRole('link', { name: 'Missing heading', exact: true }).click();
    await expect(window.locator('#document-title')).toHaveText('Linked Org');
    await expect(window.locator('#error')).toContainText('Heading not found: absent');
    await window.getByRole('link', { name: 'Back to Markdown' }).click();
    await expect(window.locator('#document-title')).toHaveText('Markdown notebook');
    await window.getByRole('link', { name: 'Missing', exact: true }).click();
    await expect(window.locator('#error')).toContainText('missing.md');
    await expect(window.locator('#document-title')).toHaveText('Markdown notebook');
    await writeFile(file, source.replace('Readable', 'Updated'));
    await expect(window.locator('#content strong')).toHaveText('Updated');
    await writeFile(path.join(directory, 'markdown-replacement'), source.replace('Readable', 'Atomic'));
    await rename(path.join(directory, 'markdown-replacement'), file);
    await expect(window.locator('#content strong')).toHaveText('Atomic');
    await rm(file);
    await expect(window.locator('#error')).toBeVisible();
    await writeFile(file, source);
    await expect(window.locator('#content strong')).toHaveText('Readable');
    await expect(window.locator('#error')).toBeHidden();
    const cdp = await window.context().newCDPSession(window);
    for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x: 500, y: 300, data: { items: [], files: [org, other], dragOperationsMask: 1 } });
    await cdp.detach();
    await expect(window.locator('#document-title')).toHaveText('Another Markdown document');
    const child = spawn(app.process().spawnfile, [...appArgs, pathToFileURL(file).href, profileArg], { env, stdio: 'ignore' });
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    await expect(window.locator('#document-title')).toHaveText('Markdown notebook');
    if (process.platform === 'darwin') {
      await app.evaluate(({ app }, file) => app.emit('open-file', { preventDefault() {} }, file), other);
      await expect(window.locator('#document-title')).toHaveText('Another Markdown document');
    }
    expect(remoteRequests).toEqual([]);
    console.log('Markdown smoke passed: GFM, mixed tabs, local links, fragments, images, Mermaid, themes, source, search, live saves, picker, drops, and CLI file URLs.');
  } finally { window.off('request', onRequest); }
}
