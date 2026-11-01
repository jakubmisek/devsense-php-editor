// esbuild build script for devsense-php-editor-sampleweb
const esbuild = require('esbuild');

esbuild
  .build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    format: 'esm',
    outfile: 'dist/bundle.js',
    external: ['monaco-editor', 'devsense-php-editor'],
  })
  .then(() => {
    console.log('Built bundle.js');
  })
  .catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });
