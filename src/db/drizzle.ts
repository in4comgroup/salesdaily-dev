import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema } from './schema';

// Plain TCP Postgres via node-postgres (works against the managed Postgres
// in production and against Neon's direct endpoint locally). `db.execute`
// resolves to `{ rows }` — same shape the old neon-http driver returned,
// so the raw-SQL call sites (products, analytics) are unaffected.
//
// The pool is cached on `globalThis` so `next dev` HMR doesn't open a new
// pool on every reload. DATABASE_POOL_MAX caps connections per process —
// keep `replicas × max` under the managed instance's connection limit.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // The DB is reached over a public IP; keep idle sockets alive so a
    // NAT/LB in between doesn't silently drop them.
    keepAlive: true,
  });

if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = pool;

// A dropped idle connection must not crash the process — the pool just
// discards it and opens a new one on the next query.
pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

export const db = drizzle(pool, { schema });
