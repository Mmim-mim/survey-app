const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../public/index.html'), 'utf8');
const block = html.slice(html.indexOf('      function populateBudgetYears('), html.indexOf('      populateBudgetYears();'));
function setup() {
  const select = { options: [], replaceChildren() { this.options = []; }, appendChild(o) { this.options.push(o); } };
  const context = vm.createContext({ select, Intl, Date, document: { createElement: () => ({}) } });
  vm.runInContext(block, context);
  return { select, render: date => context.populateBudgetYears(new Date(date)) };
}
test('Index fiscal filter: Thai October boundary, one future year and current default', () => {
  const { select, render } = setup();
  for (const [date, expected] of [['2026-09-30',2569],['2026-10-01',2570],['2027-09-30',2570],['2027-10-01',2571],['2028-09-30',2571],['2028-10-01',2572]]) {
    render(date+'T00:00:00+07:00');
    assert.equal(select.value, String(expected));
    assert.deepEqual(select.options.map(o=>Number(o.value)), Array.from({length:expected-2566+2},(_,i)=>2566+i));
  }
});
test('Index fiscal filter: retains history, no duplicates on rerender, Bangkok midnight rollover', () => {
  const { select, render } = setup();
  render('2027-09-30T16:59:59Z');
  const before = select.options.map(o=>o.value);
  assert.equal(select.value,'2570');
  render('2027-09-30T17:00:00Z');
  assert.equal(select.value,'2571');
  assert(before.every(y=>select.options.some(o=>o.value===y)));
  render('2027-09-30T17:00:00Z');
  assert.equal(new Set(select.options.map(o=>o.value)).size,select.options.length);
});
