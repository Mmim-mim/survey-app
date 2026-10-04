const {TARGET,assertTarget}=require('../test-db-safety');
assertTarget(TARGET);
Object.assign(process.env,{SURVEY_MIXED_TEST:'1',DB_HOST:TARGET.host,DB_PORT:String(TARGET.port),DB_NAME:TARGET.database,DB_USER:'root',DB_PASS:'',PORT:'33008',NODE_ENV:'development',RENDER:'false'});
require('../server');
