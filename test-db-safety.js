"use strict";
// Never reads .env. All test writers must pass this guard before creating a connection.
const TARGET = Object.freeze({ host: "127.0.0.1", port: 33308, database: "survey_mixed_test" });
const DISPOSABLE_TARGET = Object.freeze({ host: "127.0.0.1", port: 33308, database: "survey_mixed_disposable" });
function assertDestructiveTarget(config, optIn) {
  if (optIn !== true || ![DISPOSABLE_TARGET.database, QUARANTINE_TARGET.database].includes(config?.database)) {
    throw new Error("Destructive test requires explicit opt-in and an allowlisted disposable database; UAT is forbidden");
  }
  assertTarget({...config, database: TARGET.database});
  return config;
}
async function connectDisposable(config, optIn) {
  assertDestructiveTarget(config, optIn);
  const db = await require("mysql2/promise").createConnection(config);
  try {
    const [[r]] = await db.query("SELECT @@port port, VERSION() version, DATABASE() db");
    if (Number(r.port) !== TARGET.port || !/^8\./.test(r.version) || r.db !== config.database) throw new Error("Unexpected disposable server");
    return db;
  } catch (e) { await db.end(); throw e; }
}
const QUARANTINE_TARGET = Object.freeze({ host: "127.0.0.1", port: 33308, database: "survey_quarantine_regression" });
function assertTarget(config) {
  if (!config || config.host !== TARGET.host || Number(config.port) !== TARGET.port ||
      config.database !== TARGET.database || config.socketPath || config.uri || config.ssl) {
    throw new Error("Unsafe test database: only 127.0.0.1:33308/survey_mixed_test is allowed");
  }
  return config;
}
async function connect(config) {
  assertTarget(config);
  const db = await require("mysql2/promise").createConnection(config);
  try {
    const [[r]] = await db.query("SELECT @@port port, VERSION() version, DATABASE() db");
    if (Number(r.port) !== TARGET.port || !/^8\./.test(r.version) || r.db !== TARGET.database) throw new Error("Unexpected test server");
    return db;
  } catch (e) { await db.end(); throw e; }
}
function assertQuarantineTarget(config) {
  if (config?.database !== QUARANTINE_TARGET.database) throw new Error("Unsafe quarantine test database");
  assertTarget({...config,database:TARGET.database});
  return config;
}
module.exports = { TARGET, DISPOSABLE_TARGET, QUARANTINE_TARGET, assertTarget, assertQuarantineTarget, assertDestructiveTarget, connectDisposable, connect };
