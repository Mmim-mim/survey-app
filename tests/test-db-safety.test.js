const test = require('node:test'), assert = require('node:assert/strict');
const { TARGET, QUARANTINE_TARGET, assertTarget, assertQuarantineTarget } = require('../test-db-safety');
const {DISPOSABLE_TARGET, assertDestructiveTarget, connectDisposable} = require('../test-db-safety');
test('destructive guard requires opt-in and excludes durable UAT even with opt-in', async () => {
  for (const target of [TARGET, {...DISPOSABLE_TARGET,database:'survey_app'}, {...DISPOSABLE_TARGET,host:'aiven.example'}, {...DISPOSABLE_TARGET,port:25248}]) {
    assert.throws(() => assertDestructiveTarget(target,true));
    await assert.rejects(connectDisposable(target,true));
  }
  for (const optIn of [undefined,false,'true',1]) assert.throws(() => assertDestructiveTarget(DISPOSABLE_TARGET,optIn));
  assert.equal(assertDestructiveTarget(DISPOSABLE_TARGET,true),DISPOSABLE_TARGET);
  assert.equal(assertDestructiveTarget(QUARANTINE_TARGET,true),QUARANTINE_TARGET);
});
test('destructive entry points refuse execution without opt-in before connecting', () => {
  const {spawnSync}=require('node:child_process'),path=require('node:path');
  for(const name of ['init-mixed-db.cjs','mysql-mixed.cjs','mysql-quarantine.cjs','browser-mixed.cjs','disposable-server.cjs']) {
    const r=spawnSync(process.execPath,[path.join(__dirname,name)],{encoding:'utf8',timeout:5000});
    assert.notEqual(r.status,0,name);
    assert.match(r.stderr,/explicit opt-in/,name);
    assert.doesNotMatch(r.stderr,/ECONNREFUSED|ETIMEDOUT/,name);
  }
});
test('test DB safety fails closed before connection for every mismatched target', () => {
  assert.equal(assertTarget(TARGET), TARGET);
  for (const changed of [{host:'example.aivencloud.com'}, {host:'localhost'}, {port:25248},
    {database:'survey_app'}, {database:undefined}, {socketPath:'/tmp/mysql.sock'}, {uri:'mysql://remote'}, {ssl:{}}]) {
    assert.throws(() => assertTarget({...TARGET, ...changed}), /Unsafe test database/);
  }
  assert.throws(() => assertTarget({}));
  assert.equal(assertQuarantineTarget(QUARANTINE_TARGET), QUARANTINE_TARGET);
  assert.throws(() => assertQuarantineTarget({...QUARANTINE_TARGET,database:'survey_app'}));
  assert.throws(() => assertQuarantineTarget({...QUARANTINE_TARGET,host:'aiven.example'}));
});
