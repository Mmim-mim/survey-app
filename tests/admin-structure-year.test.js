const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the actual page script with a small DOM and HTTP fake, never a database.
async function page(search, years = [2571, 2570]) {
  const elements = new Map(), calls = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', innerHTML: '', disabled: false, events: {},
      addEventListener(name, callback) { this.events[name] = callback; },
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: element, querySelectorAll: () => [], querySelector: () => null },
    location: { search }, localStorage: { getItem: () => 'admin' }, URLSearchParams,
    console, alert() {}, confirm: () => true,
    async fetch(url, options) {
      calls.push({ url: new URL(url, 'http://test'), method: options.method || 'GET' });
      return { ok: true, json: async () => url.startsWith('/api/question-bank/years')
        ? years.map(fiscal_year => ({ fiscal_year })) : [] };
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/admin-structure.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { context, element, calls };
}

for (const year of ['2571', 'legacy']) test(`URL ${year} uses explicit year and enables CRUD`, async () => {
  const p = await page('?fiscal_year=' + year);
  assert.equal(p.element('structureYear').value, year);
  assert.equal(p.element('btnSave').disabled, false);
  await p.context.api('/api/survey-question-groups/9', { method: 'PUT' });
  assert.ok(p.calls.slice(1).every(call => call.url.searchParams.get('fiscal_year') === year));
  assert.equal(p.calls[0].url.searchParams.has('fiscal_year'), false);
});

test('unknown URL year blocks every resource and mutation without requesting Legacy', async () => {
  const p = await page('?fiscal_year=2572');
  assert.equal(p.element('structureYear').value, '');
  assert.equal(p.element('structureYearError').textContent, 'ไม่พบปีงบประมาณ 2572 กรุณาเลือกปีงบประมาณที่มีอยู่');
  for (const id of ['btnNew', 'btnNewCategory', 'btnNewGroup', 'btnSave', 'btnDelete', 'titleInput']) {
    assert.equal(p.element(id).disabled, true);
  }
  for (const resource of ['sections', 'question-categories', 'question-groups']) {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      await assert.rejects(p.context.api('/api/survey-' + resource, { method }), /ไม่พบปีงบประมาณ/);
    }
  }
  await p.context.saveData(); await p.context.deleteData();
  assert.equal(p.calls.length, 1);
  assert.equal(p.context.location.search, '?fiscal_year=2572');
});

test('selecting 2571 after invalid URL restores CRUD scoped to 2571', async () => {
  const p = await page('?fiscal_year=2572');
  p.element('structureYear').value = '2571';
  await p.element('structureYear').events.change();
  assert.equal(p.element('structureYearError').textContent, '');
  for (const id of ['btnNew', 'btnNewCategory', 'btnNewGroup', 'btnSave', 'btnDelete']) assert.equal(p.element(id).disabled, false);
  for (const resource of ['sections', 'question-categories', 'question-groups']) {
    for (const method of ['POST', 'PUT', 'DELETE']) await p.context.api('/api/survey-' + resource, { method });
  }
  assert.ok(p.calls.slice(1).every(call => call.url.searchParams.get('fiscal_year') === '2571'));
});

test('Legacy-only registry needs explicit selection; empty year never falls back', async () => {
  const p = await page('', []);
  assert.equal(p.calls.length, 1);
  assert.equal(p.element('btnSave').disabled, true);
  await assert.rejects(p.context.api('/api/survey-sections'));
  p.element('structureYear').value = 'legacy';
  await p.element('structureYear').events.change();
  assert.equal(p.element('btnSave').disabled, false);
  assert.equal(p.calls.at(-1).url.searchParams.get('fiscal_year'), 'legacy');
});
