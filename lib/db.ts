import { neon } from "@neondatabase/serverless";

let _sql: ReturnType<typeof neon> | null = null;

function getSQL() {
  if (!_sql) {
    _sql = neon(process.env.DATABASE_URL!);
  }
  return _sql;
}

export default getSQL;

export async function query<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const sql = getSQL();
  const result = await sql(strings, ...values);
  return result as T[];
}

export async function initDB() {
  const sql = getSQL();
  await sql`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      host_name TEXT NOT NULL,
      guest_name TEXT,
      host_id TEXT NOT NULL,
      guest_id TEXT,
      status TEXT NOT NULL DEFAULT 'waiting',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS game_state (
      code TEXT PRIMARY KEY REFERENCES rooms(code),
      host_board JSONB DEFAULT '[]',
      guest_board JSONB DEFAULT '[]',
      host_score INT DEFAULT 0,
      guest_score INT DEFAULT 0,
      host_lines INT DEFAULT 0,
      guest_lines INT DEFAULT 0,
      host_level INT DEFAULT 1,
      guest_level INT DEFAULT 1,
      host_status TEXT DEFAULT 'playing',
      guest_status TEXT DEFAULT 'playing',
      host_garbage INT DEFAULT 0,
      guest_garbage INT DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
}
