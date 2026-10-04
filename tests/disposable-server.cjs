// Owned integration-test server. Never reuse an existing HTTP server (including UAT).
const safety = require('../test-db-safety');
const { spawn } = require('node:child_process');
async function start() {
  safety.assertDestructiveTarget(safety.DISPOSABLE_TARGET, process.argv.includes('--allow-destructive-test'));
  const child = spawn(process.execPath, [__filename, '--child', '--allow-destructive-test'], {
    cwd: require('node:path').resolve(__dirname, '..'), windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env}
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Disposable server startup timed out')), 15000);
      const done = fn => value => { clearTimeout(timer); fn(value); };
      child.once('error', done(reject));
      child.once('exit', done(() => reject(new Error('Disposable server exited before readiness; do not reuse port 33009'))));
      let output = '';
      child.stdout.on('data', b => { output += b; if (output.includes('Server running on port 33009')) done(resolve)(); });
      child.stderr.on('data', () => {}); // Do not echo connection/configuration errors containing secrets.
    });
  } catch (e) { child.kill(); throw e; }
  return {stop: () => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve); child.kill();
  })};
}
if (require.main === module) {
  safety.assertDestructiveTarget(safety.DISPOSABLE_TARGET, process.argv.includes('--allow-destructive-test'));
  if (!process.argv.includes('--child')) throw new Error('Use integration runner, not a shared disposable server');
  Object.assign(process.env, {SURVEY_MIXED_TEST:'disposable', SURVEY_ALLOW_DESTRUCTIVE_TEST:'1',
    DB_HOST:safety.DISPOSABLE_TARGET.host, DB_PORT:String(safety.DISPOSABLE_TARGET.port),
    DB_NAME:safety.DISPOSABLE_TARGET.database, DB_USER:'root', DB_PASS:'', PORT:'33009',
    NODE_ENV:'development', RENDER:'false'});
  require('../server');
}
module.exports = {start};
