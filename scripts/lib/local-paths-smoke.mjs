import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function checkLocalPaths(window, directory) {
  const folder = path.join(directory, 'paths café 日本語');
  await mkdir(folder);
  const chart = path.join(folder, 'chart.svg');
  const target = path.join(folder, 'destination.md');
  await writeFile(chart, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>');
  await writeFile(target, '# Path destination\r\n\r\n## Heading\r\nBody.\r\n');
  for (const format of ['org', 'md']) {
    const imageTargets = [chart, chart.replaceAll('\\', '/'), pathToFileURL(chart).href];
    const linkTargets = [target, target.replaceAll('\\', '/'), pathToFileURL(target).href];
    const source = format === 'org'
      ? '#+title: Local path checks\r\n* Images\r\n' + imageTargets.map((file) => `[[file:${file.replace(/^file:/, '')}]]`).join('\r\n')
        + '\r\n' + linkTargets.map((file, index) => `[[file:${file.replace(/^file:/, '')}#heading][Destination ${index}]]`).join('\r\n') + '\r\n'
      : '# Local path checks\r\n\r\n' + imageTargets.map((file) => `![Chart](<${file}>)`).join('\r\n\r\n')
        + '\r\n\r\n' + linkTargets.map((file, index) => `[Destination ${index}](<${file}#heading>)`).join('\r\n\r\n') + '\r\n';
    const file = path.join(folder, `source.${format}`);
    await writeFile(file, source);
    await window.evaluate((file) => window.markupPreview.openPath(file), file);
    await expect(window.locator('#document-title')).toHaveText('Local path checks');
    await expect(window.locator('#content img')).toHaveCount(3);
    for (let index = 0; index < linkTargets.length; index++) {
      await window.getByText(`Destination ${index}`, { exact: true }).click();
      await expect(window.locator('#document-title')).toHaveText('Path destination');
      await window.evaluate((file) => window.markupPreview.openPath(file), file);
      await expect(window.locator('#document-title')).toHaveText('Local path checks');
    }
  }
  console.log('Local path smoke passed: native/forward-slash paths, file URLs, spaces, Unicode, CRLF, images, and document links.');
}
