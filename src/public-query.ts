import { Pool } from "pg";

// Public SQL must authenticate as its own restricted login, including on reconnect.
export function createPublicPool(databaseUrl?: string, password?: string) {
  if (!databaseUrl || !password) return null;
  const endpoint = new URL(databaseUrl);
  return new Pool({
    host: endpoint.hostname,
    port: Number(endpoint.port || 5432),
    database: decodeURIComponent(endpoint.pathname.slice(1)),
    user: "public_snapshot_reader",
    password,
    ssl: { rejectUnauthorized: false },
    max: 4,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
}

export async function runPublicQuery(pool: Pool, sql: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const statement = { text: sql, queryMode: "extended" };
    return await client.query(statement);
  } finally {
    // Discard the session, rolling back and clearing settings between anonymous requests.
    client.release(true);
  }
}
