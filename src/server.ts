
// src/server.ts
import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import rateLimit from "express-rate-limit";
import { Pool } from "pg";

import {
  fetchDWBefore,
  newTronWeb,
  parseAmountsExact,
  toUTC,
  SRTX_INTEGER_OUTPUT,
  trimZeros,
} from "./lib";

import { insertMstrSharplinkToDB } from "./insert-mstr-sharplink";

const app = express();

// ----------------- Postgres 连接池 -----------------
const DB_URL = process.env.DATABASE_URL;

let pool: Pool | null = null;

if (DB_URL) {
  pool = new Pool({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }, // Render 外部连 Postgres 要开 SSL
  });
  console.log("Postgres pool created");
} else {
  console.warn(" DATABASE_URL not set, DB features will not work");
}

// ----------------- 中间件 -----------------
app.use(cors());
app.use(express.json());

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
  })
);

// 静态文件（你现在的 html 在 src/public 下面）
app.use(express.static(path.join(process.cwd(), "src/public")));

// =============== SQL 工具相关 ===============

// 统一的 SQL 校验 + 规范化：
// - 允许末尾一个分号 ; （会被自动去掉）
// - 不允许出现多个分号（防止多语句）
// - 必须是以 SELECT 开头
function normalizeSelect(raw: string): { ok: boolean; sql: string; error?: string } {
  if (!raw) return { ok: false, sql: "", error: "SQL is empty" };

  let s = raw.trim();

  // 去掉末尾一个分号（如果有）
  if (s.endsWith(";")) {
    s = s.slice(0, -1).trim();
  }

  const lower = s.toLowerCase();

  // 不允许在中间再出现分号
  if (lower.includes(";")) {
    return { ok: false, sql: "", error: "Multiple statements are not allowed" };
  }

  if (!lower.startsWith("select")) {
    return { ok: false, sql: "", error: "Only read-only SELECT statements are allowed" };
  }

  return { ok: true, sql: s };
}

// POST /api/sql  —— 返回 JSON，给页面展示用
app.post("/api/sql", async (req: Request, res: Response) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not configured" });
    }

    const rawSql = String(req.body.sql || "");
    const norm = normalizeSelect(rawSql);
    if (!norm.ok) {
      return res.status(400).json({ error: norm.error });
    }

    const r = await pool.query(norm.sql);

    return res.json({
      rows: r.rows,
      rowCount: r.rowCount,
      fields: r.fields.map((f: any) => f.name),
    });
  } catch (e: any) {
    console.error("SQL error", e);
    return res.status(500).json({ error: e.message || "Query failed" });
  }
});

// GET /api/sql-csv  —— 直接下载 CSV 文件
// 前端是 window.location = "/api/sql-csv?sql=..."
app.get("/api/sql-csv", async (req: Request, res: Response) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not configured" });
    }

    const rawSql = String(req.query.sql || "");
    const norm = normalizeSelect(rawSql);
    if (!norm.ok) {
      return res.status(400).json({ error: norm.error });
    }

    const result = await pool.query(norm.sql);
    const fields = result.fields.map((f: any) => f.name);

    const csvRows: string[] = [];
    // header
    csvRows.push(fields.join(","));

    // 每一行数据
    for (const row of result.rows) {
      const line = fields
        .map((f) => JSON.stringify(row[f] ?? "")) // 简单转义
        .join(",");
      csvRows.push(line);
    }

    const csvStr = csvRows.join("\n");

    res.setHeader("Content-Disposition", "attachment; filename=query_result.csv");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.send(csvStr);
  } catch (e: any) {
    console.error("CSV error", e);
    return res.status(500).json({ error: e.message || "CSV failed" });
  }
});

// =============== ① /api/top5 ===============

/**
 * API: GET /api/top5?date=YYYY-MM-DD&lookback=48
 */
app.get("/api/top5", async (req: Request, res: Response) => {
  try {
    const date = String(req.query.date || "");
    const lookback = Number(req.query.lookback || 48);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }
    if (!(lookback > 0 && lookback <= 168)) {
      return res.status(400).json({ error: "lookback must be 1~168 hours" });
    }

    const targetMs = Date.parse(`${date}T00:00:00.000Z`);
    const tronWeb = newTronWeb();
    const events = await fetchDWBefore(tronWeb, targetMs, lookback);

    const data = events.map((e: any) => {
      const ts = Number(e.block_timestamp ?? e.timestamp);
      const txid = e.transaction_id || e.transaction || "";
      const { strxExact, trxExact, strxFloor, ratioStr } = parseAmountsExact(e);

      const outSTRX = SRTX_INTEGER_OUTPUT ? strxFloor : trimZeros(strxExact);
      const outTRX = trimZeros(trxExact);

      return {
        time_utc: toUTC(ts),
        type: e.event_name,
        txid,
        TRX: outTRX,
        sTRX: outSTRX,
        ratio: ratioStr,
      };
    });

    return res.json({ date, lookback, count: data.length, data });
  } catch (e: any) {
    console.error(e?.response?.data || e);
    return res.status(500).json({ error: e?.message || "internal error" });
  }
});

// =============== ② /api/wallet/latest ===============

app.get("/api/wallet/latest", async (_req: Request, res: Response) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not configured" });
    }

    const snapRes = await pool.query(
      `SELECT id, captured_at, address, total_assets_usd
         FROM wallet_snapshots
        ORDER BY captured_at DESC
        LIMIT 1`
    );

    if (snapRes.rowCount === 0) {
      return res.status(404).json({ error: "No snapshot found" });
    }

    const snapshot = snapRes.rows[0];

    const tokenRes = await pool.query(
      `SELECT token_id,
              token_name,
              token_abbr,
              token_type,
              token_decimal,
              balance,
              amount_usd,
              price_usd,
              usd_ratio,
              is_trx,
              is_strx
         FROM wallet_tokens
        WHERE snapshot_id = $1
        ORDER BY is_strx DESC, is_trx DESC, amount_usd DESC`,
      [snapshot.id]
    );

    return res.json({
      snapshot: {
        id: snapshot.id,
        captured_at: snapshot.captured_at,
        address: snapshot.address,
        total_assets_usd: snapshot.total_assets_usd,
      },
      tokens: tokenRes.rows,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
});


app.get("/api/mstr-sharplink/latest", async (_req: Request, res: Response) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not configured" });
    }

    const [mstrRes, sharplinkRes] = await Promise.all([
      pool.query(
        `SELECT *
           FROM mstr_snapshots
          ORDER BY timestamp_utc DESC
          LIMIT 1`
      ),
      pool.query(
        `SELECT *
           FROM sharplink_snapshots
          ORDER BY timestamp_utc DESC
          LIMIT 1`
      ),
    ]);

    return res.json({
      mstr: mstrRes.rows[0] ?? null,
      sharplink: sharplinkRes.rows[0] ?? null,
    });
  } catch (e: any) {
    console.error("mstr-sharplink latest error", e);
    return res.status(500).json({ error: e.message || "internal error" });
  }
});


app.post("/api/mstr-sharplink/refresh", async (_req: Request, res: Response) => {
  try {
    if (!pool) {
      return res.status(500).json({ ok: false, error: "DATABASE_URL not configured" });
    }

    // 1. 调用共用的插入逻辑（内部自己新建 client）
    const ids = await insertMstrSharplinkToDB();

    // 2. 再查一次最新的 snapshot（和 /latest 保持一致）
    const [mstrRes, sharplinkRes] = await Promise.all([
      pool.query(
        `SELECT *
           FROM mstr_snapshots
          ORDER BY timestamp_utc DESC
          LIMIT 1`
      ),
      pool.query(
        `SELECT *
           FROM sharplink_snapshots
          ORDER BY timestamp_utc DESC
          LIMIT 1`
      ),
    ]);

    return res.json({
      ok: true,
      inserted: ids,
      mstr: mstrRes.rows[0] ?? null,
      sharplink: sharplinkRes.rows[0] ?? null,
    });
  } catch (e: any) {
    console.error("mstr-sharplink refresh error", e);
    return res.status(500).json({ ok: false, error: e.message || "internal error" });
  }
});

// =============== SR SNAPSHOT API ===============
app.get("/api/sr/latest", async (_req: Request, res: Response) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not configured" });
    }

    const result = await pool.query(`
      SELECT 
        id,
        timestamputc,
        reward,
        reward - LAG(reward) OVER (ORDER BY id) AS delta
      FROM sr_snapshots
      ORDER BY id DESC
      LIMIT 50
    `);

    return res.json(result.rows);
  } catch (e: any) {
    console.error("sr latest error", e);
    return res.status(500).json({ error: e.message || "internal error" });
  }
});

// =============== KELP rsETH API ===============

app.get("/api/kelp-rseth/latest", async (_req: Request, res: Response) => {

  try {

    if (!pool) {
      return res.status(500).json({
        error: "DATABASE_URL not configured"
      });
    }

    const result = await pool.query(`
      SELECT
        id,
        timestamp_hkt,
        chain,
        rpc,
        address,
        raw_supply,
        total_supply,
        status
      FROM kelp_rseth_supply_snapshots
      ORDER BY id DESC
      LIMIT 100
    `);

    return res.json(result.rows);

  } catch (e: any) {

    console.error(
      "kelp rsETH latest error",
      e
    );

    return res.status(500).json({
      error: e.message || "internal error"
    });
  }
});

// ----------------- health -----------------
app.get("/health", (_req: Request, res: Response) => {
  return res.send("ok");
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});