const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(__dirname + '/metricool.js', 'utf8');
function page({ url = 'https://usenotinha.com.br/blog/', consent = 'all', referrer = '', blocked = false } = {}) {
  let choice = consent;
  const scripts = [], calls = [], events = {};
  const context = {
    URL, location: new URL(url), setTimeout: fn => fn(),
    localStorage: { getItem() { if (blocked) throw Error('blocked'); return choice; } },
    document: {
      referrer, getElementById: id => id === 'planos' ? {} : null,
      querySelector: () => scripts[0],
      createElement: () => ({ addEventListener(name, fn) { this[name] = fn; } }),
      head: { appendChild: script => scripts.push(script) },
      addEventListener: (name, fn) => { events[name] = fn; }
    },
    addEventListener: (name, fn) => { events[name] = fn; }
  };
  context.window = context;
  vm.createContext(context);
  const run = () => vm.runInContext(code, context);
  run();
  return { scripts, calls, context, run, choose(value) { choice = value; events.click(); },
    load() { context.beTracker = { t: value => calls.push(value.hash) }; scripts[0].load(); } };
}
test('one asynchronous loader and one visit even after duplicate execution/load/click', () => {
  const p = page(); p.run(); p.choose('all');
  assert.equal(p.scripts.length, 1); assert.equal(p.scripts[0].async, true);
  assert.equal(p.scripts[0].referrerPolicy, 'no-referrer');
  p.load(); p.load(); p.choose('all');
  assert.deepEqual(p.calls, ['2ad3966fcc4ad132dd87a95f5b5c37dd']);
});
for (const consent of [null, 'essential']) test('waits for opt-in: ' + consent, () => {
  const p = page({ consent }); assert.equal(p.scripts.length, 0);
  p.choose('all'); assert.equal(p.scripts.length, 1); p.load(); assert.equal(p.calls.length, 1);
});
test('revocation while script is loading prevents the visit', () => {
  const p = page(); p.choose('essential'); p.load(); assert.equal(p.calls.length, 0);
});
test('blocked storage does not throw or track', () => assert.equal(page({ blocked: true }).scripts.length, 0));
for (const url of ['http://localhost:8080/', 'https://example.com/', 'https://usenotinha.com.br/?token=secret', 'https://usenotinha.com.br/?utm_source=test', 'https://usenotinha.com.br/#secret', 'https://usenotinha.com.br/painel/#secret', 'https://usenotinha.com.br/conta.html', 'https://usenotinha.com.br/conectado.html', 'https://usenotinha.com.br/pagamento-confirmado/']) {
  test('does not track unsafe or non-production URL: ' + url, () => assert.equal(page({ url }).scripts.length, 0));
}
test('does not leak a query in the referrer', () => assert.equal(page({ referrer: 'https://usenotinha.com.br/?token=secret' }).scripts.length, 0));
test('allows a known on-page anchor', () => assert.equal(page({ url: 'https://usenotinha.com.br/#planos' }).scripts.length, 1));
test('vendor failure does not break the site', () => {
  const p = page(); p.context.beTracker = { t() { throw Error('vendor'); } };
  assert.doesNotThrow(() => p.scripts[0].load());
});
