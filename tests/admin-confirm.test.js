// Execute the real handlers with mocked UI/API: never contacts a database.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
const cases = [
  ['users', 'admin-users.js', 'deleteUser', [10, 'original'], ['/api/admin/users/10?role=admin']],
  ['forms', 'admin-forms.js', 'deleteForm', [10, 'original'], ['/api/admin/forms/10?role=admin']],
  ['bulk forms', 'admin-forms.js', null, [], ['/api/admin/forms/10?role=admin', '/api/admin/forms/11?role=admin']],
  ['questions', 'admin-questions.js', 'deleteQuestion', [10], ['/api/admin/questions/10?role=admin']],
  ['bulk questions', 'admin-questions.js', 'deleteSelectedQuestions', [], ['/api/admin/questions/10?role=admin', '/api/admin/questions/11?role=admin']],
  ['structure', 'admin-structure.js', 'deleteData', [], ['/api/survey-question-groups/10']],
  ['department', 'admin-departments.js', null, [], ['/api/admin/departments/10']],
];
function setup(entry) {
  const [name, file, fn, args] = entry, calls = [], modals = [];
  let resolve, handler, ids = [10, 11];
  const c = vm.createContext({deletePending: false, busy: false, role: 'admin',
    bankYear: {value: '2571'}, structureYear: {value: '2571'}, structureReady: true,
    selectedId: 10, selectedType: 'group', selectedParentId: 1,
    editing: {id: 10, dept_name: 'original'}, categoryMap: {}, groupMap: {},
    openSectionIds: new Set([10]), openCategoryIds: new Set([10]),
    btnDeleteSelected: {disabled: false, textContent: 'ลบที่เลือก'},
    getSelectedQuestionIds: () => [...ids],
    document: {querySelectorAll: () => ids.map(value => ({value: String(value)})), getElementById: () => ({addEventListener: (_event, fn) => handler = fn, set onclick(fn) {handler = fn;}})},
    AdminPopup: {confirm: options => {modals.push(options); return new Promise(r => resolve = r);}, alert: async () => {}},
    api: async (url, options) => { assert.equal(options.method, 'DELETE'); calls.push(url); },
    loadUsers: async () => {}, loadForms: async () => {}, loadQuestions: async () => {}, refreshTree: async () => {}, resetForm: () => {},
    saveAction: async action => action(),
  });
  const source = read(file);
  if (fn) {vm.runInContext(source.match(new RegExp('async function ' + fn + '\\([^]*?\\n\\}'))[0], c); handler = c[fn];}
  else if (name === 'bulk forms') vm.runInContext(source.slice(source.indexOf('document.getElementById("btnDeleteSelected")'), source.indexOf('const adminReady')), c);
  else vm.runInContext(source.slice(source.indexOf("document.getElementById('deleteDepartment').onclick"), source.indexOf("dialog.addEventListener('close'")), c);
  return {c, calls, modals, run: () => handler(...args), answer: value => resolve(value), mutate: () => {ids = [99]; c.selectedId = 99; c.selectedType = 'section'; c.editing = {id: 99, dept_name: 'changed'};}};
}
for (const entry of cases) {
  for (const response of ['YES', 'CANCEL', 'ESCAPE']) test(entry[0] + ' ' + response + ': writes only for YES', async () => {
    const h = setup(entry), pending = h.run();
    assert.equal(h.calls.length, 0); assert.equal(h.modals.length, 1);
    h.answer(response === 'YES'); await pending;
    assert.deepEqual(h.calls, response === 'YES' ? entry[4] : []);
    assert.equal(h.c.deletePending, false);
  });
  test(entry[0] + ': duplicate blocked and original target retained', async () => {
    const h = setup(entry), pending = h.run(); h.mutate();
    await h.run(); assert.equal(h.modals.length, 1);
    if (entry[0].startsWith('bulk')) assert.match(h.modals[0].message, /2/);
    h.answer(true); await pending;
    assert.deepEqual(h.calls, entry[4]); assert.equal(h.c.deletePending, false);
  });
  test(entry[0] + ': action stays locked during request, unlocks on failure', async () => {
    const h = setup(entry); let reject;
    h.c.api = () => new Promise((_resolve, r) => reject = r);
    const pending = h.run(); const settled = pending.catch(() => {});
    h.answer(true); await new Promise(r => setImmediate(r));
    await h.run(); assert.equal(h.modals.length, 1);
    reject(Error('mock failure')); await settled;
    assert.equal(h.c.deletePending, false);
  });
}
for (const entry of cases.filter(c => ['questions', 'bulk questions', 'structure'].includes(c[0]))) {
  test(entry[0] + ': fiscal year changed while confirming => zero writes', async () => {
    const h = setup(entry), pending = h.run();
    h.c.bankYear.value = '2572'; h.c.structureYear.value = '2572';
    h.answer(true); await pending; assert.deepEqual(h.calls, []);
  });
}
