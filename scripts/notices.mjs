import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
const seen = new Set();
let output = `#+title: Third-party notices\n\nmarkup-preview's own code uses BSD-3-Clause. Dependencies retain their licenses.\nDOMPurify is used under its Apache-2.0 option. Electron's distribution also\nincludes LICENSE and LICENSES.chromium.html for its bundled components.\n\nRegenerate this file with =npm run notices= after dependency updates.\n`;
async function visit(name, from = process.cwd()) {
  let parent = path.resolve(from), directory;
  while (true) {
    directory = path.join(parent, 'node_modules', name);
    try { await access(path.join(directory, 'package.json')); break; }
    catch (error) {
      if (error.code !== 'ENOENT' || path.dirname(parent) === parent) throw error;
      parent = path.dirname(parent);
    }
  }
  if (seen.has(directory)) return;
  seen.add(directory);
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const files = await readdir(directory);
  const license = files.find((file) => /^license(?:\.(?:md|org|txt))?$/i.test(file));
  let licenseText;
  if (license) licenseText = await readFile(path.join(directory, license), 'utf8');
  else {
    const readme = files.find((file) => /^readme\.md$/i.test(file));
    const text = readme ? await readFile(path.join(directory, readme), 'utf8') : '';
    licenseText = text.match(/^(?:## License|License\r?\n=+)\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]?.trim();
    if (!licenseText || !/Copyright/i.test(licenseText)) throw new Error(`Missing license text for ${name}`);
  }
  // format 0.2.2 ships its copyright and MIT URL, but omits the permission text.
  if (name === 'format' && pkg.version === '0.2.2') licenseText += '\n\n' + await readFile(new URL('licenses/MIT-permission.txt', import.meta.url), 'utf8');
  const licenseName = pkg.license || pkg.licenses?.map((license) => license.type).join(' OR ');
  output += `\n* ${name} ${pkg.version}\nLicense: ${licenseName}\n\n#+begin_example\n${licenseText}\n#+end_example\n`;
  for (const dependency of Object.keys(pkg.dependencies || {})) await visit(dependency, directory);
}
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
for (const dependency of Object.keys(pkg.dependencies)) await visit(dependency);
await writeFile('THIRD-PARTY-NOTICES.org', output);
