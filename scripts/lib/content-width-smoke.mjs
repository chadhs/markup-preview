import { expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { setAppearance } from './appearance-smoke.mjs';

export async function checkContentWidth(window, directory, prefix) {
  const originalViewport = window.viewportSize();
  const cdp = await window.context().newCDPSession(window);
  const prose = 'Research notes with enough prose to compare the reading column with the full preview pane. '.repeat(8);
  const table = '| Topic | Current view | Research response and status | Linked questions |\n'
    + '| Categories | Expected reporting categories include commissions and vendors. | Record commissions and vendor payments as proposed primary product groupings. Separate payment purpose from recipient identity. | Q11–Q18 |\n'
    + '| Withholding | Do not expect withholding to be needed. | Backup withholding applies in specified circumstances. Confirm the conditions before choosing the reporting workflow. | Q06, Q19 |';
  const manyColumns = Array.from({ length: 18 }, (_, index) => 'Column' + (index + 1));
  const wide = '| ' + manyColumns.join(' | ') + ' |\n| ' + manyColumns.map(() => 'Value').join(' | ') + ' |';
  const url = 'https://example.invalid/' + 'unbroken'.repeat(80);
  await mkdir('test-results', { recursive: true });
  const files = [];
  for (const format of ['md', 'org']) {
    const file = path.join(directory, 'width.' + format);
    files.push(file);
    const lines = table.split('\n');
    const body = format === 'md'
      ? '# Width comparison md\n\n' + prose + '\n\n' + [lines[0], '| --- | --- | --- | --- |', ...lines.slice(1)].join('\n')
        + '\n\n## Many columns\n\n' + wide.split('\n')[0] + '\n| ' + manyColumns.map(() => '---').join(' | ') + ' |\n' + wide.split('\n')[1]
        + '\n\n## Long link\n\n| Link |\n| --- |\n| ' + url + ' |'
      : '#+title: Width comparison org\n\n' + prose + '\n\n' + [lines[0], '|-+-+-+-|', ...lines.slice(1)].join('\n')
        + '\n\n* Many columns\n\n' + wide + '\n\n* Long link\n\n| Link |\n|-|\n| ' + url + ' |';
    await writeFile(file, body);
    await window.evaluate((file) => window.markupPreview.openPath(file), file);
    await expect(window.locator('#document-title')).toHaveText('Width comparison ' + format);
    await expect(window.locator('#content table')).toHaveCount(3);
    for (const width of [2560, 720]) {
      // Keep Playwright's native-window viewport state untouched. Mixing
      // setViewportSize with a raw CDP reset leaves screenshot sizing stale.
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width, height: width === 2560 ? 1440 : 700, deviceScaleFactor: 0, mobile: false,
      });
      for (const outline of [true, false]) {
        if (await window.locator('#sidebar').isVisible() !== outline) await window.locator('#toggle-outline').click();
        for (const contentWidth of ['reading', 'full']) {
          await setAppearance(window, { contentWidth });
          await window.keyboard.press('Escape');
          const dimensions = await window.evaluate(() => {
            const reader = document.querySelector('#reader');
            const doc = document.querySelector('#document');
            const top = document.querySelector('.page-top');
            return {
              reader: reader.clientWidth, document: doc.getBoundingClientRect().width,
              left: doc.getBoundingClientRect().left, topLeft: top.getBoundingClientRect().left,
              overflow: reader.scrollWidth > reader.clientWidth,
            };
          });
          expect(dimensions.document).toBe(contentWidth === 'full' ? dimensions.reader : Math.min(850, dimensions.reader));
          if (contentWidth === 'full') expect(dimensions.topLeft).toBe(dimensions.left);
          expect(dimensions.overflow).toBe(false);
          await expect(window.locator('#content td').first()).toHaveCSS('overflow-wrap', 'normal');
          // The short Topic header stays on one line even when the table is constrained.
          const topicHeight = await window.locator('#content th').first().evaluate((cell) => {
            const range = document.createRange();
            range.selectNodeContents(cell);
            return { height: range.getBoundingClientRect().height, line: parseFloat(getComputedStyle(cell).lineHeight) };
          });
          expect(topicHeight.height).toBeLessThanOrEqual(topicHeight.line);
          expect(await window.locator('.table-wrap').last().evaluate((wrap) => wrap.scrollWidth > wrap.clientWidth)).toBe(true);
          if (width === 720) await window.locator('.table-wrap').first().scrollIntoViewIfNeeded();
          await window.screenshot({ path: 'test-results/' + prefix + '-width-' + format + '-' + width + '-' + (outline ? 'outline' : 'hidden') + '-' + contentWidth + '.png' });
          await window.locator('#reader').evaluate((reader) => { reader.scrollTop = 0; });
        }
      }
    }
  }
  // Width remains global while each document retains its own preview/source mode.
  await window.locator('#source-tab').click();
  await expect(window.locator('#toggle-content-width')).toBeDisabled();
  const sourceBounds = await window.locator('#source').boundingBox();
  await setAppearance(window, { contentWidth: 'reading' });
  await window.keyboard.press('Escape');
  expect(await window.locator('#source').boundingBox()).toEqual(sourceBounds);
  await window.evaluate((file) => window.markupPreview.openPath(file), files[0]);
  await expect(window.locator('#document-title')).toHaveText('Width comparison md');
  await expect(window.locator('#source')).toBeHidden();
  await expect(window.locator('#toggle-content-width')).toBeEnabled();
  await expect(window.locator('#content-width')).toHaveValue('reading');
  await window.locator('#toggle-content-width').click();
  await window.evaluate((file) => window.markupPreview.openPath(file), files[1]);
  await expect(window.locator('#document-title')).toHaveText('Width comparison org');
  await expect(window.locator('#source')).toBeVisible();
  await expect(window.locator('#toggle-content-width')).toBeDisabled();
  await expect(window.locator('#content-width')).toHaveValue('full');
  await window.locator('#preview-tab').click();
  await window.emulateMedia({ media: 'print' });
  await expect(window.locator('#document')).toHaveCSS('max-width', 'none');
  await expect(window.locator('#document')).toHaveCSS('padding', '0px');
  await window.emulateMedia({ media: 'screen' });
  await setAppearance(window, { contentWidth: 'reading' });
  await window.keyboard.press('Escape');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await cdp.detach();
  expect(window.viewportSize()).toEqual(originalViewport);
  console.log('Content width smoke passed: both formats, wide/narrow panes, outline, table overflow, tab modes, and print.');
}
