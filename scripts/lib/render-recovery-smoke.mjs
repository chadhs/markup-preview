import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function checkRenderRecovery(window, directory, previousFile) {
  const file = path.join(directory, 'unrenderable.md');
  const source = '> '.repeat(3000) + 'Deeply nested text\n![Image](missing.png)\n';
  await writeFile(file, source);
  await window.evaluate((file) => window.markupPreview.openPath(file), file);
  await expect(window.locator('#filename')).toHaveText('unrenderable.md');
  await expect(window.locator('#error')).toBeVisible();
  await expect(window.locator('#error')).toContainText('Could not render this file');
  await expect(window.locator('#source')).toBeVisible();
  expect(await window.locator('#source').textContent()).toBe(source);
  await expect(window.locator('#preview-tab')).toBeDisabled();
  await expect(window.locator('#content')).toBeEmpty();
  // An unrelated session notification must not clear the active render error.
  await window.evaluate(async () => {
    const state = await window.markupPreview.initial();
    await window.markupPreview.activate(state.activeId);
  });
  await expect(window.locator('#error')).toBeVisible();
  await window.locator('#source-tab').click();
  expect(await window.locator('#source').textContent()).toBe(source);
  await writeFile(file, '# Recovered preview\n\nReadable again.');
  await expect(window.locator('#preview-tab')).toBeEnabled();
  await expect(window.locator('#error')).toBeHidden();
  await window.locator('#preview-tab').click();
  await expect(window.locator('#document-title')).toHaveText('Recovered preview');
  await expect(window.locator('#content')).toContainText('Readable again.');
  await window.evaluate(async () => {
    const state = await window.markupPreview.initial();
    await window.markupPreview.close(state.activeId);
  });
  await expect(window.locator('#breadcrumb')).toHaveText(previousFile);
  console.log('Render recovery passed: correct source, persistent error, and recovery after save.');
}
