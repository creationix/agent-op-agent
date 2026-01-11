// Write the compiler to gitfs via REST API or directly
const compiler = await Bun.file('dist/encantis-compiler-browser.js').text();
console.log('Compiler size:', compiler.length, 'bytes');

// Write to stdout for piping
console.log('---CONTENT---');
console.log(compiler);
