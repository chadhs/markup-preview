import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createImageFixture, fixturePng } from './image-fixture.mjs';

export async function checkProcessing(window, directory, previousFile) {
  const file = path.join(directory, 'worker.md');
  await writeFile(file, '# Worker document\n\nSearch while processing.');
  // Delay delivery to a real worker so interaction/cancellation tests do not
  // depend on machine speed. No production test hooks are needed.
  await window.evaluate(() => {
    window.originalWorker = window.Worker;
    window.processingWorkers = 0; window.terminatedWorkers = 0;
    window.Worker = class extends window.originalWorker {
      constructor(...args) { super(...args); window.processingWorkers++; }
      postMessage(...args) { this.delivery = setTimeout(() => super.postMessage(...args), 800); }
      terminate() { clearTimeout(this.delivery); window.terminatedWorkers++; return super.terminate(); }
    };
  });
  try {
    await window.evaluate((file) => window.markupPreview.openPath(file), file);
    await expect.poll(() => window.evaluate(() => window.processingWorkers)).toBe(1);
    await window.locator('#source-tab').click();
    await window.locator('#find-button').click();
    await window.locator('#search').fill('Search');
    await expect(window.locator('#preview-tab')).toBeEnabled();
    await expect(window.locator('#source')).toBeVisible();
    await expect(window.locator('#search')).toHaveValue('Search');
    await expect(window.locator('#search-count')).toHaveText('1 / 1');
    await writeFile(file, '# Replacement pending\n\nUpdated source.');
    await expect.poll(() => window.evaluate(() => window.processingWorkers)).toBe(2);
    await window.evaluate((file) => window.markupPreview.openPath(file), previousFile);
    await expect(window.locator('#breadcrumb')).toHaveText(previousFile);
    await expect(window.locator('#preview-tab')).toBeEnabled();
    await expect(window.locator('#error')).toBeHidden();
    expect(await window.evaluate(() => window.terminatedWorkers)).toBeGreaterThanOrEqual(3);
    await window.evaluate(async (file) => {
      const state = await window.markupPreview.initial();
      await window.markupPreview.close(state.tabs.find((tab) => tab.path === file).id);
    }, file);
  } finally { await window.evaluate(() => { window.Worker = window.originalWorker; delete window.originalWorker; }); }

  const fixture = await createImageFixture((_request, response) => { response.writeHead(200); response.write(fixturePng.subarray(0, 8)); });
  const images = path.join(directory, 'independent-images.md');
  try {
    await writeFile(path.join(directory, 'offline.png'), fixturePng);
    await writeFile(images, `# Independent images\n\n![Slow](${fixture.origin}/slow)\n\n![Local](./offline.png)`);
    await window.evaluate((file) => window.markupPreview.openPath(file), images);
    await expect(window.locator('[data-image-id="1"]')).toHaveAttribute('data-loaded', 'true', { timeout: 3000 });
    expect(await window.locator('[data-image-id="0"]').getAttribute('data-loaded')).toBeNull();
    await window.evaluate(async () => {
      const state = await window.markupPreview.initial(); await window.markupPreview.close(state.activeId);
    });
    await expect(window.locator('#breadcrumb')).toHaveText(previousFile);
  } finally { await fixture.close(); }
  console.log('Processing smoke passed: worker cancellation, responsive source/search, and local images during stalled downloads.');
}
