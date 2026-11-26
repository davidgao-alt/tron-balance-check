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

// Postgres error classes that only describe the submitted query: data exceptions (22, e.g. bad
// date literal) and syntax / unknown name / permission errors (42). Their messages are shown so
// people can fix their SQL; anything else (connection, server) stays generic.
const QUERY_ERROR_CLASSES = ["22", "42"];

export function describePublicQueryError(
  e: { code?: string; message?: string; position?: string },
  rawSql = ""
): { status: number; error: string } {
  const code = String(e.code || "");
  if (code === "57014") {
    return { status: 400, error: "Query took too long (over 10 seconds). Add a LIMIT or narrow the WHERE filter." };
  }
  if (!QUERY_ERROR_CLASSES.includes(code.slice(0, 2)) || !e.message) {
    return { status: 400, error: "Public query failed" };
  }

  let error = e.message;
  // position is 1-based in the trimmed SQL that was run; map it back to a line of what was typed.
  const position = Number(e.position);
  if (position > 0) {
    const lead = rawSql.length - rawSql.trimStart().length;
    const line = rawSql.slice(0, lead + position - 1).split("\n").length;
    error += ` (line ${line})`;
  }
  return { status: code === "42501" ? 403 : 400, error };
}
