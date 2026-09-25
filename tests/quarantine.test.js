const test = require('node:test');
const assert = require('node:assert/strict');
const q = require('../test-data-quarantine');

test('Tombstones reject nested references even without a year marker', () => {
  for (const form of [
    { nested: [{ questionBankId: '175' }] }, { question_bank_id: 288 },
    { bankGroupId: 21 }, { group_id: 60 }, { category_id: 7 },
    { datalist_id: 'group_40_suggestions' },
    { section2_models: [{ id: 7 }] },
    { section2_models: [{ dimensions: [{ id: 21 }] }] },
  ]) assert.throws(() => q.assertReferences(form), { code: 'TEST_DATA_QUARANTINED' });
  q.assertReferences({ fiscal_year: 2570, questionId: 175, questionBankId: null });
  q.assertReferences({ fiscal_year: 2570, questionBankId: 289, bankGroupId: 61, category_id: 17 });
});
test('Only the test Form ID is quarantined', () => {
  assert.throws(() => q.assertFormId('114'), { code: 'TEST_DATA_QUARANTINED' });
  for (const id of [76, 77, 86, 94, 96, 112, 115]) q.assertFormId(id);
});
test('Form writer validates and writes on one locked connection before responding', async () => {
  const events = [];
  const conn = { async beginTransaction() { events.push('begin'); },
    async execute(sql) { events.push(sql.includes('FOR UPDATE') ? 'lock' : 'write'); return [[{ id: 1 }]]; },
    async commit() { events.push('commit'); }, async rollback() { events.push('rollback'); }, release() { events.push('release'); } };
  const response = { status() { return this; }, json() { events.push('response'); } };
  await q.formWriter({ async getConnection() { return conn; } }, async (req, res, db) => {
    assert.equal(db, conn); await db.execute('INSERT'); res.json({ ok: true });
  })({ body: { form: {} } }, response);
  assert.deepEqual(events, ['begin', 'lock', 'write', 'commit', 'response', 'release']);
});
test('Validation failure rolls back; failed commit never returns success', async () => {
  for (const failCommit of [false, true]) {
    let rolledBack = false, released = false;
    const conn = { async beginTransaction() {}, async execute() { return [[{ id: 1 }]]; },
      async commit() { throw Error('commit failed'); }, async rollback() { rolledBack = true; }, release() { released = true; } };
    const res = { status(n) { this.code = n; return this; }, json(x) { this.data = x; } };
    await q.formWriter({ async getConnection() { return conn; } }, async (_, reply) => {
      reply.status(failCommit ? 200 : 409).json({ ok: failCommit });
    })({ body: { form: {} } }, res);
    assert.equal(res.code, failCommit ? 500 : 409);
    assert(rolledBack && released); assert.notEqual(res.data.ok, true);
  }
});
