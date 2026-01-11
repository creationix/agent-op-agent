// Build script to bundle the compiler for browser use
import { build } from 'bun';

const result = await build({
  entrypoints: ['./compiler.ts'],
  outdir: './dist',
  target: 'browser',
  format: 'iife',
  naming: 'encantis-compiler.js',
  minify: false, // Keep readable for debugging
});

if (!result.success) {
  console.error('Build failed:', result.logs);
  process.exit(1);
}

// Read the output and wrap it to expose EncantisCompiler globally
const outputPath = './dist/encantis-compiler.js';
let code = await Bun.file(outputPath).text();

// The IIFE build doesn't export, so we need to manually expose it
// Let's create a version that exports to window
const browserCode = `// Encantis Compiler - Browser Bundle
(function() {
${code}
  // Export to global scope
  window.EncantisCompiler = EncantisCompiler;
})();
`;

await Bun.write(outputPath, browserCode);
console.log('Built:', outputPath);
console.log('Size:', browserCode.length, 'bytes');
