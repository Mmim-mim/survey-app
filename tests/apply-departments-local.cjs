// Explicit local-only additive migration. Never reads .env or resets fixtures.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const {connect,TARGET} = require('../test-db-safety');
async function main() {
  if (!process.argv.includes('--apply-local')) throw Error('Requires --apply-local; Local UAT only');
  const db = await connect({...TARGET,user:'root'});
  try {
    const [tables] = await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('departments','department_name_aliases')");
    const [columns] = await db.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'department_id'");
    if (tables.length || columns.length) throw Error('Migration 003 is already present or partial: inspect; do not reapply');
    const [[userTable]] = await db.query('SHOW CREATE TABLE users');
    if (!userTable['Create Table'].includes('ENGINE=InnoDB')) throw Error('Requires InnoDB users');
    const sql = fs.readFileSync(path.join(__dirname,'../migrations/003-departments.sql'),'utf8').replace(/^\s*--.*$/gm, '');
    for (const statement of sql.split(';').filter(s => s.trim())) await db.query(statement);
    // Authorized Local-only legacy names; NOT part of production migration/seed.
    const names = ['ฝ่ายเลขานุการ','ฝ่ายพัฒนาและจัดระบบทรัพยากรสารนิเทศ','ฝ่ายบริการทรัพยากรสารนิเทศ','ฝ่ายเทคโนโลยีสารสนเทศ'];
    await db.beginTransaction();
    try {
      for (const [i,name] of names.entries()) {
        const [r] = await db.execute('INSERT INTO departments (dept_name,sort_order,first_used_at) VALUES (?,?,NOW())',[name,i]);
        await db.execute('INSERT INTO department_name_aliases (dept_name,department_id) VALUES (?,?)',[name,r.insertId]);
      }
      await db.commit();
    } catch(e) { await db.rollback(); throw e; }
    console.log('Migration 003 applied to guarded Local UAT; 4 legacy departments protected. No existing rows rewritten.');
  } finally { await db.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode=1; });
