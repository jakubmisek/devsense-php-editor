// esbuild plugin to handle font files referenced by monaco-editor CSS
const fs = require('fs');

module.exports = {
  name: 'font-plugin',
  setup(build) {
    // Resolve .ttf files directly from node_modules
    build.onResolve({ filter: /\.ttf$/ }, (args) => {
      return { path: args.path, namespace: 'file' };
    });
    // Load .ttf files as base64 data URIs
    build.onLoad({ filter: /\.ttf$/, namespace: 'file' }, (args) => {
      if (!args.path.endsWith('.ttf')) return;
      const contents = fs.readFileSync(args.path, { encoding: 'base64' });
      return {
        contents: `data:application/font-sfnt;base64,${contents}`,
        loader: 'dataurl',
      };
    });
  },
};
