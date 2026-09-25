const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../public/from.html'), 'utf8');

test('Required-field validation keeps original messages and summary when the date is missing or conflicting', () => {
  const errors = [], notices = [];
  const context = vm.createContext({
    FiscalYear: require('../public/fiscal-year'),
    document: { getElementById: id => id, querySelector: selector => selector },
    clearAllFieldErrors() { errors.length = 0; notices.length = 0; },
    showFieldError(field, message) { errors.push({ field, message }); },
    showValidationSummary() { notices.push('summary'); },
    focusFirstError() { notices.push('focus'); },
  });
  vm.runInContext(html.slice(html.indexOf('function validateBeforeSave('), html.indexOf('function buildFormPayload(')), context);
  const valid = { form_title: 'Project', start_date: '2026-10-01', end_date: '2026-10-02', fiscal_year: 2570,
    goal_text: 'Goal', kpi_quantity: '1', kpi_quality: 'Good', budget_received: '0',
    dept_name: 'Department', center_mission: 'Mission', center_strategy: 'Strategy', section2_enabled: false };
  assert.equal(context.validateBeforeSave({ ...valid, form_title: '', start_date: '' }), false);
  assert(errors.some(e => e.message === 'กรุณากรอกชื่อโครงการ'));
  assert(errors.some(e => e.message === 'กรุณาเลือกวันที่เริ่มต้น'));
  assert.deepEqual(notices, ['summary', 'focus']);
  assert.equal(context.validateBeforeSave({ ...valid, fiscal_year: 2571 }), false);
  assert(errors.some(e => e.field === 'start_date'));
  assert.deepEqual(notices, ['summary', 'focus']);
  assert.equal(context.validateBeforeSave(valid), true);
  assert.deepEqual(errors, []);
});
function setup() {
  const lists = new Map();
  function node() {
    return { dataset: {}, children: [], set innerHTML(value) { this.children = []; },
      appendChild(child) { this.children.push(child); } };
  }
  const context = vm.createContext({
    bankRows: [], questionBankByListAndText: new Map(), pageMode: 'create',
    createQuestionBankLookupKey: (a, b) => a + '__' + b,
    refreshAllQuestionSuggestions() {}, console,
    document: {
      getElementById: id => lists.get(id), createElement: node,
      body: { appendChild(list) { lists.set(list.id, list); } },
      querySelectorAll: selector => selector === 'datalist' ? [...lists.values()] : [],
    },
  });
  vm.runInContext(html.slice(html.indexOf('async function loadQuestionBankIntoDatalists()'), html.indexOf('async function loadProjectDropdowns()')), context);
  vm.runInContext(html.slice(html.indexOf('function clearBankOptions()'), html.indexOf('let acceptedStartDate')), context);
  return { context, lists };
}
test('Legacy group datalist retains old alias and supplies stable group alias with bank IDs', async () => {
  const { context, lists } = setup();
  context.bankRows = [{ id: 30, group_id: 20, datalist_id: 'affectOfServiceSuggestions', question_text: 'Question A' }];
  await context.loadQuestionBankIntoDatalists();
  for (const id of ['affectOfServiceSuggestions', 'group_20_suggestions']) {
    assert.equal(lists.get(id).children[0].value, 'Question A');
    assert.equal(lists.get(id).children[0].dataset.questionBankId, '30');
    assert.equal(context.questionBankByListAndText.get(id + '__Question A').id, 30);
  }
});

test('Duplicate question text offers explicit IDs; plain ambiguous text cannot bind the wrong ID', async () => {
  const { context, lists } = setup();
  context.bankRows = [70, 71].map(id => ({ id, group_id: 40, datalist_id: 'group_40_suggestions', question_text: 'Same text' }));
  await context.loadQuestionBankIntoDatalists();
  assert.equal(context.questionBankByListAndText.get('group_40_suggestions__Same text'), null);
  const options = lists.get('group_40_suggestions').children;
  assert.notEqual(options[0].value, options[1].value);
  assert.equal(context.questionBankByListAndText.get('group_40_suggestions__' + options[0].value).id, 70);
  assert.equal(context.questionBankByListAndText.get('group_40_suggestions__' + options[1].value).id, 71);
});

test('Create derives bank year from start date and invalid dates clear suggestions without requests', async () => {
  const elements = { start_date: { addEventListener(_, fn) { this.change = fn; } }, mainModels: {}, bankLoadStatus: {} };
  const years = [];
  const context = vm.createContext({
    document: { getElementById: id => elements[id], querySelector: () => null },
    pageMode: 'create', bankReady: false, bankFiscalYear: null, fiscalYearSelect: {},
    calculateFiscalYear: date => { try { return String(require('../public/fiscal-year').fromStartDate(date)); } catch { return ''; } },
    bankLoader: { invalidate() {} }, clearBankOptions() { years.push('clear'); },
    async reloadBankForCreate() { years.push(context.fiscalYearSelect.value); }, confirm: () => true,
  });
  vm.runInContext(html.slice(html.indexOf('let acceptedStartDate'), html.indexOf('let savedDraft')), context);
  for (const date of ['2026-09-30', '2026-10-01', '2027-10-01', '']) {
    await elements.start_date.change({ target: { value: date } });
  }
  assert.deepEqual(years, ['2569', '2570', '2571', 'clear']);
  assert.equal(context.bankReady, false);
  assert.equal(elements.mainModels.innerHTML, '');
});
test('Year switch clears old aliases and IDs; groups and project dropdowns stay separate', async () => {
  const { context, lists } = setup();
  context.bankRows = [{ id: 30, group_id: 20, datalist_id: 'old_list', question_text: 'Old year' }];
  await context.loadQuestionBankIntoDatalists();
  context.clearBankOptions();
  context.bankRows = [
    { id: 60, group_id: 40, datalist_id: 'group_40_suggestions', question_text: 'New year A' },
    { id: 61, group_id: 41, datalist_id: 'group_41_suggestions', question_text: 'New year B' },
    { id: 62, group_id: 42, datalist_id: 'dept_name', question_text: 'Department' },
  ];
  await context.loadQuestionBankIntoDatalists();
  assert.equal(lists.get('group_20_suggestions').children.length, 0);
  assert.equal(lists.get('old_list').children.length, 0);
  assert.equal(context.questionBankByListAndText.has('old_list__Old year'), false);
  assert.equal(lists.get('group_40_suggestions').children.length, 1);
  assert.equal(lists.get('group_40_suggestions').children[0].dataset.questionBankId, '60');
  assert.equal(lists.get('group_41_suggestions').children[0].dataset.questionBankId, '61');
  assert.equal(lists.has('group_42_suggestions'), false);
});
