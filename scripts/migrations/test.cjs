// Requires an explicitly provided disposable database server; never loads env files.
const { Client } = require('pg');
const fs=require('node:fs'); const os=require('node:os'); const path=require('node:path');
const {spawn}=require('node:child_process'); const assert=require('node:assert/strict');
async function main(){
 const url=process.env.MIGRATION_TEST_DATABASE_URL;
 assert(url,'Set MIGRATION_TEST_DATABASE_URL to a disposable PostgreSQL 17 server');
 const admin=new Client({connectionString:url}); await admin.connect();
 const version=Number((await admin.query('SHOW server_version_num')).rows[0].server_version_num);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-migrations-'));
 for(const dir of ['scripts/migrations','db/baseline','db/migrations']) fs.mkdirSync(path.join(root,dir),{recursive:true});
 for(const f of ['run.cjs','catalog.sql']) fs.copyFileSync(path.join(__dirname,f),path.join(root,'scripts/migrations',f));
 const repo=path.resolve(__dirname,'../..');
 for(const f of ['0000_baseline.sql','0001_deal_funnel_stage_settings.sql']) {
  let sql=fs.readFileSync(path.join(repo,'db/baseline',f),'utf8');
  // PG16 is a preliminary compatibility test only, never the release acceptance run.
  if(version<170000) sql=sql.replace('SET transaction_timeout = 0;','');
  fs.writeFileSync(path.join(root,'db/baseline',f),sql);
 }
 const manifest=['../baseline/0000_baseline.sql','../baseline/0001_deal_funnel_stage_settings.sql'];
 const save=()=>fs.writeFileSync(path.join(root,'db/migrations/manifest.json'),JSON.stringify(manifest)); save();
 const databases=[];
 async function db(){const name=`crm_test_${process.pid}_${databases.length}`; await admin.query(`CREATE DATABASE ${name}`); databases.push(name); const u=new URL(url);u.pathname='/'+name;return u.toString();}
 async function run(url,mode='apply',ok=true){const result=await new Promise(resolve=>{let out='';const p=spawn(process.execPath,[path.join(root,'scripts/migrations/run.cjs'),mode],{env:{...process.env,DATABASE_URL:url,NODE_PATH:path.join(repo,'node_modules')}});p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>out+=x);p.on('exit',code=>resolve({code,out}));});assert.equal(result.code===0,ok,result.out);return result.out;}
 try{
  const fresh=await db(); await run(fresh); await run(fresh);
  const catalog=JSON.parse(await run(fresh,'catalog'));
  if(version>=170000) assert.deepEqual(catalog,JSON.parse(fs.readFileSync(path.join(repo,'db/migrations/existing-schema.json'))), 'Registration fixture differs on PostgreSQL 17');
  fs.writeFileSync(path.join(root,'db/migrations/existing-schema.json'),JSON.stringify(catalog));
  if(process.env.WRITE_MIGRATION_FIXTURE==='1') fs.writeFileSync(path.join(repo,'db/migrations/existing-schema.json'),JSON.stringify(catalog,null,2)+'\n');
  const c=new Client({connectionString:fresh});await c.connect();await c.query('DROP SCHEMA crm_migrations CASCADE');await c.end();
  await run(fresh,'apply',false); await run(fresh,'register-existing'); await run(fresh);
  const bad=await db(); const b=new Client({connectionString:bad});await b.connect();await b.query('CREATE TABLE public.partial(id int)');await b.end();await run(bad,'register-existing',false);
  manifest.push('0002_probe.sql');save();fs.writeFileSync(path.join(root,'db/migrations/0002_probe.sql'),'SELECT pg_sleep(1); CREATE TABLE public.probe(id int);');
  await Promise.all([run(fresh),run(fresh)]);
  fs.appendFileSync(path.join(root,'db/migrations/0002_probe.sql'),'\n-- changed');await run(fresh,'apply',false);
  fs.writeFileSync(path.join(root,'db/migrations/0002_probe.sql'),'SELECT pg_sleep(1); CREATE TABLE public.probe(id int);');
  manifest.push('0003_failure.sql');save();fs.writeFileSync(path.join(root,'db/migrations/0003_failure.sql'),'CREATE TABLE public.must_rollback(id int); SELECT 1/0;');await run(fresh,'apply',false);
  const check=new Client({connectionString:fresh});await check.connect();assert.equal((await check.query("SELECT to_regclass('public.must_rollback') AS t")).rows[0].t,null);assert.equal((await check.query('SELECT count(*)::int AS n FROM crm_migrations.history')).rows[0].n,3);await check.end();
  manifest.pop();manifest.pop();save();await run(fresh,'apply',false);
  console.log(`PASS: fresh, repeat, registration, refusal, parallel, checksum, atomic failure, old release (PostgreSQL ${version})`);
 }finally{for(const name of databases)await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();fs.rmSync(root,{recursive:true,force:true});}
}
main().catch(()=>{console.error('Integration test failed; connection details suppressed');process.exitCode=1});
