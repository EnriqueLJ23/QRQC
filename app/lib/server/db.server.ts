import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { env } from "./env.server";
import { sembrarDatos } from "./seed.server";

// numeric → number, date → 'YYYY-MM-DD' (evita desfases de zona horaria)
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
pg.types.setTypeParser(1082, (v) => v);

declare global {
  var __qrqcPool: pg.Pool | undefined;
  var __qrqcBootstrap: Promise<void> | undefined;
}

function crearPool() {
  return new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
}

async function crearBaseSiFalta() {
  const url = new URL(env.DATABASE_URL);
  const nombreDb = url.pathname.replace(/^\//, "");
  const urlAdmin = new URL(env.DATABASE_URL);
  urlAdmin.pathname = "/postgres";
  const cliente = new pg.Client({ connectionString: urlAdmin.toString() });
  await cliente.connect();
  try {
    const res = await cliente.query("SELECT 1 FROM pg_database WHERE datname = $1", [nombreDb]);
    if (res.rowCount === 0) {
      await cliente.query(`CREATE DATABASE "${nombreDb}"`);
    }
  } finally {
    await cliente.end();
  }
}

async function bootstrap() {
  await crearBaseSiFalta();
  const pool = crearPool();
  globalThis.__qrqcPool = pool;
  const schema = fs.readFileSync(
    path.join(process.cwd(), "app", "lib", "server", "schema.sql"),
    "utf8"
  );
  await pool.query(schema);
  await sembrarDatos(pool);
}

export async function getPool(): Promise<pg.Pool> {
  if (!globalThis.__qrqcBootstrap) {
    globalThis.__qrqcBootstrap = bootstrap();
  }
  await globalThis.__qrqcBootstrap;
  return globalThis.__qrqcPool!;
}

export async function query<T extends pg.QueryResultRow = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const pool = await getPool();
  const res = await pool.query<T>(sql, params);
  return res.rows;
}

export async function queryOne<T extends pg.QueryResultRow = any>(
  sql: string,
  params: any[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
