import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setAppearance } from './lib/appearance-smoke.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'markup-preview-screenshots-'));
let app;
try {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  for (const extension of ['org', 'md']) await copyFile(`examples/welcome.${extension}`, path.join(directory, `welcome.${extension}`));
  app = await electron.launch({ args: ['.', path.join(directory, 'welcome.org'), path.join(directory, 'welcome.md'), `--user-data-dir=${path.join(directory, 'profile')}`], env, chromiumSandbox: true });
  const window = await app.firstWindow();
  await expect(window.locator('#document-title')).toHaveText('Your words, in Markdown.');
  await expect(window.locator('.diagram')).toHaveAttribute('data-rendered', 'true', { timeout: 15000 });
  for (const [mode, theme] of [['light', 'light'], ['dark', 'solarized-dark']]) {
    const previous = await window.locator('.diagram-output img').getAttribute('src');
    await setAppearance(window, { mode, [mode]: theme });
    await window.keyboard.press('Escape');
    await window.locator('#reader').click({ position: { x: 15, y: 15 } });
    if (mode === 'dark') {
      await expect(window.locator('.diagram-output img')).not.toHaveAttribute('src', previous);
      await window.locator('#md-heading-code-and-diagrams').evaluate((heading) => heading.scrollIntoView({ block: 'start' }));
    }
    else await window.locator('#reader').evaluate((reader) => { reader.scrollTop = 0; });
    await expect(window.locator('.diagram')).toHaveAttribute('data-rendered', 'true');
    await window.screenshot({ path: `docs/screenshots/preview-${mode}.png` });
  }
} finally { await app?.close(); await rm(directory, { recursive: true, force: true }); }
