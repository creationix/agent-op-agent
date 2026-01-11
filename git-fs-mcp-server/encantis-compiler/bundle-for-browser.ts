const code = await Bun.file('dist/encantis-compiler.js').text();
// Insert global export before final closure
const modified = code.replace(
  /\}\)\(\);[\s]*$/,
  '  window.EncantisCompiler = EncantisCompiler;\n})();\n'
);
await Bun.write('dist/encantis-compiler-browser.js', modified);
console.log('Created browser bundle with global export');
