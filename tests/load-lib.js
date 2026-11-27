// Loads the plain scripts of lib/ into a sandbox, the way the browser does (shared globals),
// so their functions can be tested with Node's built-in test runner.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadLib(...files) {
  const context = vm.createContext({ URL });
  for (const file of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', file), 'utf8');
    vm.runInContext(src, context, { filename: file });
  }
  return context;
}

module.exports = { loadLib };
