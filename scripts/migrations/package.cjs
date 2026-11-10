// Copy pg and its locked runtime dependency closure, independent of Next tracing.
const fs = require('node:fs');
const path = require('node:path');
const dest = process.argv[2];
const copied = new Set();
function copy(name, from) {
  if (copied.has(name)) return;
  let source = path.dirname(require.resolve(name, { paths: [from] }));
  while (!fs.existsSync(path.join(source, 'package.json'))) {
    const parent = path.dirname(source);
    if (parent === source) throw Error('Package root not found');
    source = parent;
  }
  const file = path.join(source, 'package.json');
  copied.add(name);
  fs.cpSync(source, path.join(dest, name), { recursive: true, dereference: true });
  const pkg = JSON.parse(fs.readFileSync(file));
  for (const dependency of Object.keys(pkg.dependencies || {})) copy(dependency, source);
}
copy('pg', process.cwd());
