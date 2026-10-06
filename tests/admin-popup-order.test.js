const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const read = name => fs.readFileSync(require('node:path').join(__dirname, '../public', name), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(extra = {}) {
  let acknowledge;
  const events = [];
  const context = vm.createContext({events, deletePending: false, structureYear: {value: '2571'}, AdminPopup: {confirm: async () => true, alert: () => {events.push('alert'); return new Promise(resolve => acknowledge = resolve);}}, ...extra});
  return {context, events, acknowledge: () => acknowledge()};
}
for (const name of ['admin.js', 'admin-users.js', 'admin-forms.js', 'admin-questions.js']) {
  test(name + ': guard redirects only after acknowledgement', async () => {
    const h = harness({role: 'staff', window: {location: {href: ''}}});
    const source = read(name).match(/async function guardAdmin\(\) \{[\s\S]*?\n\}/)[0];
    vm.runInContext(source, h.context);
    const result = h.context.guardAdmin();
    assert.equal(h.context.window.location.href, '');
    h.acknowledge(); assert.equal(await result, false);
    assert.equal(h.context.window.location.href, 'dashboard.html');
  });
}
for (const operation of ['saveData', 'deleteData']) {
  test('Structure ' + operation + ': refresh/reset wait for acknowledgement', async () => {
    const h = harness({structureReady: true, titleInput: {value: 'name'}, descInput: {value: ''}, sortInput: {value: 1}, activeInput: {value: '1'}, document: {getElementById: () => ({disabled: true})}, selectedType: 'section', selectedId: 9, confirm: () => true, openSectionIds: new Set([9]), categoryMap: {}, groupMap: {}});
    Object.assign(h.context, {api: async () => h.events.push('api'), refreshTree: async () => h.events.push('refresh'), resetForm: () => h.events.push('reset')});
    const source = read('admin-structure.js').match(new RegExp('async function ' + operation + '\\(\\) \\{[\\s\\S]*?\\n\\}'))[0];
    vm.runInContext(source, h.context);
    const result = h.context[operation](); await tick();
    assert.deepEqual(h.events, ['api', 'alert']);
    h.acknowledge(); await result;
    assert.deepEqual(h.events, ['api', 'alert', 'refresh', 'reset']);
  });
}
test('Forms bulk success refresh waits for acknowledgement', async () => {
  let handler;
  const h = harness({role: 'admin', confirm: () => true, document: {getElementById: () => ({addEventListener: (_event, fn) => handler = fn}), querySelectorAll: () => [{value: '9'}]}});
  Object.assign(h.context, {api: async () => h.events.push('api'), loadForms: async () => h.events.push('refresh')});
  const source = read('admin-forms.js');
  vm.runInContext(source.slice(source.indexOf('document.getElementById("btnDeleteSelected")'), source.indexOf('const adminReady')), h.context);
  const result = handler(); await tick(); assert.deepEqual(h.events, ['api', 'alert']);
  h.acknowledge(); await result; assert.deepEqual(h.events, ['api', 'alert', 'refresh']);
});
test('Departments error retains busy state until acknowledgement', async () => {
  const h = harness({busy: false});
  vm.runInContext(read('admin-departments.js').match(/async function saveAction\([\s\S]*?\n\}/)[0], h.context);
  const result = h.context.saveAction(async () => {throw Error('mock');});
  await tick(); assert.equal(h.context.busy, true);
  h.acknowledge(); await result; assert.equal(h.context.busy, false);
});
