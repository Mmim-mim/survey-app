// Explicit local provisioning. No dotenv and no connection derived from application settings.
const fs=require('fs'),path=require('path'),mysql=require('mysql2/promise');
const safety=require('../test-db-safety');
(async()=>{
  const config=safety.assertDestructiveTarget({...safety.DISPOSABLE_TARGET,user:'root'},process.argv.includes('--allow-destructive-test'));
  const {database,...controlConfig}=config;
  const control=await mysql.createConnection(controlConfig);
  try {
    const [[r]]=await control.query('SELECT @@port port,VERSION() version');
    if(r.port!==33308||!/^8\./.test(r.version))throw Error('Unexpected local MySQL');
    const [exists]=await control.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[database]);
    if(exists.length)throw Error('Test database already exists; no overwrite permitted');
    await control.query('CREATE DATABASE `survey_mixed_disposable`');
  } finally {await control.end();}
  const db=await safety.connectDisposable(config,process.argv.includes('--allow-destructive-test'));
  try {
    // Schema only: never import Production users, submissions or form data.
    const backup=fs.readFileSync('D:/Project mfu/backups/survey-final-20260925T064736Z/survey_app.sql','utf8');
    const ddl=[...backup.matchAll(/CREATE TABLE `[\s\S]*?;\r?\n/g)].map(m=>m[0]);
    if(ddl.length!==9)throw Error('Unexpected baseline schema');
    await db.query('SET FOREIGN_KEY_CHECKS=0');for(const sql of ddl)await db.query(sql);await db.query('SET FOREIGN_KEY_CHECKS=1');
    const migration=fs.readFileSync(path.join(__dirname,'../migrations/002-mixed-questions.sql'),'utf8').replace(/^--.*$/gm,'');
    for(const sql of migration.split(';').map(s=>s.trim()).filter(Boolean))await db.query(sql);
    for(const [i,[key,title]]of require('../public/section-snapshot').definitions.entries())await db.execute('INSERT INTO survey_sections (id,section_key,title,is_active,sort_order) VALUES (?,?,?,1,?)',[i+1,key,title,i]);
    await db.execute('INSERT INTO question_bank_write_lock(id) VALUES (1)');
    console.log('PASS isolated schema + migration initialized; no Production data imported');
  } finally {await db.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
