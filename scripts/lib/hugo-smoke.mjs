import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function checkHugoMetadata(window, directory, prefix) {
  const title = 'Omarchy Quattro and the Year of the Linux Desktop';
  const fixtures = [
    ['org', `#+title: ${title}\n#+author: Chad Stovern\n#+date: 2026-09-11\n#+tags[]: linux omarchy\n#+draft: false\n\n* Article\nBody of the post.`, '#+draft: false\n'],
    ['md', `---\ntitle: ${title}\nauthor: Chad Stovern\ndate: 2026-09-11\ntags: [linux, omarchy]\ndraft: false\n---\n\n## Article\nBody of the post.`, 'draft: false\n'],
    ['markdown', `+++\ntitle = "${title}"\nauthor = "Chad Stovern"\ndate = 2026-09-11\ntags = ["linux", "omarchy"]\ndraft = false\n+++\n\n## Article\nBody of the post.`, 'draft = false\n'],
  ];
  for (const [extension, source, field] of fixtures) {
    const file = path.join(directory, `hugo-post.${extension}`);
    await writeFile(file, source);
    await window.evaluate((file) => window.markupPreview.openPath(file), file);
    await expect(window.locator('#document-title')).toHaveText(title);
    await expect(window.locator('#metadata')).toContainText('Chad Stovern');
    await expect(window.locator('#metadata')).toContainText('2026-09-11');
    await expect(window.locator('.document-tags span')).toHaveText(['linux', 'omarchy']);
    await expect(window.locator('.draft-indicator')).toHaveCount(0);
    await expect(window.locator('#content')).toContainText('Body of the post.');
    await expect(window.locator('#content')).not.toContainText('draft');
    await window.locator('#source-tab').click();
    expect(await window.locator('#source').textContent()).toBe(source);
    await window.locator('#preview-tab').click();
    await writeFile(file, source.replace(field, field.replace('false', 'true')));
    await expect(window.locator('.draft-indicator')).toHaveText('Draft');
    await window.screenshot({ path: `test-results/${prefix}-hugo-${extension}-draft.png` });
    await writeFile(file, source);
    await expect(window.locator('.draft-indicator')).toHaveCount(0);
    await writeFile(file, source.replace(field, ''));
    await expect(window.locator('#source')).not.toContainText(field.trim());
    await expect(window.locator('.draft-indicator')).toHaveCount(0);
  }
  console.log('Hugo metadata smoke passed: Org, YAML, TOML, date, author, tags, unchanged source, and draft-only indicator on live saves.');
}
