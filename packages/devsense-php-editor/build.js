const esbuild = require('esbuild');
const fs = require('fs');

const outfile = 'dist/index.js';

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  outfile,
  platform: 'node',
  format: 'cjs',
  target: ['node18'],
  external: ['devsense-php-ls', 'ws'],
}).then(() => {
  fs.chmodSync(outfile, '755'); // make executable (bin)
  console.log(`✅ Built CJS bundle: ${outfile}`);
}).catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
