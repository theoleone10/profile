// Copies the federated learning demo's training code and sample data into this
// site. Only the module syntax changes, so what runs in the browser is the code
// the project runs on DCP.
//
//   node tools/vendor-fl.mjs ../qmind/federated-learning-dcp-package [git-ref]
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(process.argv[2] ?? resolve(site, '../qmind/federated-learning-dcp-package'));
const ref = process.argv[3] ?? 'HEAD';
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
const commit = git('rev-parse', '--short', ref).trim();
const read = (path) => git('show', `${ref}:${path}`).replace(/\r\n/g, '\n');

const out = resolve(site, 'js/demos/fl/lr');
await mkdir(out, { recursive: true });
const FILES = ['src/lr/math.js', 'src/lr/workFunction.js', 'src/lr/coordinator.js', 'src/lr/hyperparameters.js'];
for (const path of FILES) {
  const source = read(path)
    .replace(/^'use strict';\n\n/, '')
    .replace(/^const \{ (.+?) \} = require\('(\.\/[a-z]+)'\);$/gm, "import { $1 } from '$2.js';")
    .replace(/^module\.exports = (\{[\s\S]*?\});$/m, 'export $1;');
  // comments may mention require(); only the code must be free of it
  const code = source.split('\n').filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));
  if (code.some((line) => /require\(|module\.exports/.test(line))) throw new Error(`${path}: could not convert to a module`);
  const header = `// Copied from QMINDxDistributive/federated-learning-dcp-package, ${path} @ ${commit}.\n// Only the module syntax is changed (tools/vendor-fl.mjs).\n`;
  await writeFile(resolve(out, path.split('/').pop()), header + source);
}

// the five sample states
const names = ['alaska', 'florida', 'minnesota', 'new-york', 'washington'];
const sites = names.map((name) => JSON.parse(read(`demo/data/sites/${name}.json`)));
await mkdir(resolve(site, 'data'), { recursive: true });
await writeFile(resolve(site, 'data/brfss.json'), JSON.stringify({
  source: `CDC BRFSS 2024 sample from federated-learning-dcp-package @ ${commit}`,
  featureNames: sites[0].featureNames,
  sites: sites.map((s, i) => ({ site: names[i], X: s.X, y: s.y })),
}));
console.log(`Vendored ${FILES.length} files and ${sites.length} sites from ${commit}`);
