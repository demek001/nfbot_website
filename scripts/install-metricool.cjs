const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const tag = '<script defer src="/scripts/metricool.js"></script>';
const check = process.argv.includes('--check');
let count = 0;
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) { walk(file); continue; }
    if (!item.name.endsWith('.html')) continue;
    let html = fs.readFileSync(file, 'utf8');
    const copies = html.split(tag).length - 1;
    if (copies > 1 || !/<\/head>/i.test(html)) throw new Error(file);
    if (copies === 0) {
      if (check) throw new Error('Missing Metricool tag: ' + file);
      html = html.replace(/<\/head>/i, tag + '\n</head>');
      fs.writeFileSync(file, html);
    }
    count++;
  }
}
walk(root);
console.log(`${count} HTML pages: exactly one shared Metricool loader each.`);
