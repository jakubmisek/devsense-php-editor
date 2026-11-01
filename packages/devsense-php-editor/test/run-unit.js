// Bundle the TypeScript unit tests with esbuild and run them with node:test.
const path = require('path');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');
const fs = require('fs');

const outdir = path.join(__dirname, '..', 'node_modules', '.cache', 'unit-tests');
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.ts'));
esbuild.buildSync({
  entryPoints: files.map((f) => path.join(__dirname, f)),
  outdir, bundle: true, platform: 'node', format: 'cjs', target: 'node18',
  packages: 'external', sourcemap: 'inline', logLevel: 'warning',
});
const res = spawnSync(process.execPath, ['--test', ...files.map((f) => path.join(outdir, f.replace(/\.ts$/, '.js')))], { stdio: 'inherit' });
process.exit(res.status ?? 1);
