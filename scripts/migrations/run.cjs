// One history, one connection, one advisory lock. Never load dotenv here.
const { Client } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const mode = process.argv[2] || 'apply';
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
async function main() {
  if (!['apply', 'register-existing', 'status', 'catalog'].includes(mode)) throw Error('Unknown mode');
  const names = JSON.parse(fs.readFileSync(path.join(root, 'db/migrations/manifest.json')));
  const migrations = names.map((name, i) => {
    if (!new RegExp(`^${String(i).padStart(4,'0')}_[a-z0-9_]+\\.sql$`).test(path.basename(name))) throw Error('Invalid migration sequence');
    const bytes = fs.readFileSync(path.resolve(root, 'db/migrations', name));
    return { name: path.basename(name), checksum: hash(bytes), sql: bytes.toString() };
  });
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, application_name: 'crm-migrations' });
  await client.connect();
  try {
    await client.query("SET statement_timeout='120s'; SET lock_timeout='5s'");
    // Session lock spans per-file commits. Fail within a bounded interval.
    await client.query('SELECT pg_advisory_lock(734210981)');
    const catalog = async () => (await client.query(fs.readFileSync(path.join(__dirname,'catalog.sql'),'utf8'))).rows[0].catalog;
    if (mode === 'catalog') { console.log(JSON.stringify(await catalog(), null, 2)); return; }
    const exists = (await client.query("SELECT to_regclass('crm_migrations.history') AS t")).rows[0].t;
    const history = exists ? (await client.query('SELECT * FROM crm_migrations.history ORDER BY name')).rows : [];
    for (let i=0;i<history.length;i++) {
      if (!migrations[i] || history[i].name !== migrations[i].name || history[i].checksum !== migrations[i].checksum) throw Error('History mismatch: missing, changed or older release SQL');
    }
    if (mode === 'status') { console.log(`Applied ${history.length}; available ${migrations.length}`); return; }
    if (mode === 'register-existing') {
      if (history.length) throw Error('Registration requires empty history');
      const expected = JSON.parse(fs.readFileSync(path.join(root,'db/migrations/existing-schema.json')));
      if (JSON.stringify(await catalog()) !== JSON.stringify(expected)) throw Error('Existing schema differs from verified 0000+0001 catalog; registration refused');
    } else if (!history.length) {
      const objects = await client.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') UNION ALL SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e' UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e') LIMIT 1");
      if (objects.rowCount) throw Error('Nonempty database without history: explicit registration required');
    }
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA IF NOT EXISTS crm_migrations; CREATE TABLE IF NOT EXISTS crm_migrations.history (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), registered boolean NOT NULL)');
    await client.query('COMMIT');
    if (mode === 'register-existing') {
      await client.query('BEGIN');
      try {
        for (const m of migrations.slice(0,2)) await client.query('INSERT INTO crm_migrations.history(name,checksum,registered) VALUES($1,$2,true)', [m.name,m.checksum]);
        await client.query('COMMIT');
        console.log('Registered 0000 and 0001 without executing SQL');
      } catch(e) { await client.query('ROLLBACK'); throw e; }
      return;
    }
    const pending = migrations.slice(history.length);
    for (const m of pending) {
      await client.query('BEGIN');
      try {
        if (mode !== 'register-existing') {
          if (m.name.startsWith('0000_')) await client.query('CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm');
          // Historical 0001 owns BEGIN/COMMIT. Remove only these exact wrapper lines
          // in memory; the checksum always covers the original immutable bytes.
          let sql = m.sql;
          if (m.name === '0001_deal_funnel_stage_settings.sql') sql = sql.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
          else if (!m.name.startsWith('0000_') && /\b(BEGIN|COMMIT|ROLLBACK)\s*;/i.test(sql)) throw Error('Migration must not own transaction');
          await client.query(sql);
        }
        await client.query('INSERT INTO crm_migrations.history(name,checksum,registered) VALUES($1,$2,$3)',[m.name,m.checksum,mode === 'register-existing']);
        await client.query('COMMIT');
        console.log(`Recorded ${m.name}`);
      } catch(e) { await client.query('ROLLBACK'); throw e; }
    }
  } finally { await client.end(); }
}
main().catch(e => { console.error(`Migration failed (${e.code || 'validation'}). SQL and connection details suppressed.`); process.exitCode=1; });
