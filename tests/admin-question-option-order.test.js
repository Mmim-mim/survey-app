const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/admin-questions.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function sortQuestionOptions('), source.indexOf('async function loadQuestions(')), context);

test('Admin option rendering groups model types, then category/group order and ID without mutation', () => {
  const rows = [
    { category_title: 'ESQUAL', group_id: 1 },
    { category_title: 'LibQUAL+', category_id: 2, category_sort_order: 1, group_id: 9, group_sort_order: 2 },
    { category_title: 'WEBQUAL', group_id: 3 },
    { category_title: 'LibQUAL+', category_id: 2, category_sort_order: 1, group_id: 8, group_sort_order: 2 },
    { category_title: 'SiteQUAL', group_id: 4 },
    { category_title: 'SERVQUAL', group_id: 5 },
    { category_title: 'LibQUAL+', category_id: 2, category_sort_order: 1, group_id: 10, group_sort_order: 0 },
    { category_title: 'LibQUAL+', category_id: 1, category_sort_order: 1, group_id: 11, group_sort_order: 8 },
    { category: 'Other', datalist_id: 'dept_name' },
  ];
  const before = JSON.stringify(rows);
  const sorted = context.sortQuestionOptions(rows);
  assert.deepEqual(Array.from(sorted, r => r.group_id), [11, 10, 8, 9, 5, 3, 4, 1, undefined]);
  assert.equal(JSON.stringify(rows), before);
});

test('Legacy aliases and project options retain their values and use display-only ordering metadata', () => {
  const rows = [
    { category: 'LibQUAL+', datalist_id: 'legacyB', category_sort_id: 1, group_sort_id: 2, group_sort_order: 2 },
    { category_title: 'LibQUAL+', category_id: 1, group_id: 1, group_sort_order: 1 },
    { category: 'LibQUAL+', datalist_id: 'legacyA', category_sort_id: 1, group_sort_id: 1, group_sort_order: 1 },
  ];
  const sorted = context.sortQuestionOptions(rows);
  assert.equal(sorted.at(-1).datalist_id, 'legacyB');
  assert.equal(rows[0].group_id, undefined);
  assert.equal(rows[2].group_id, undefined);
  assert.match(source, /questionOptions = sortQuestionOptions\(await api\(/);
});
