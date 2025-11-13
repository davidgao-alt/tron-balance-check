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
  console.warn("⚠️ DATABASE_URL not set, wallet API will not work");
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

// 静态文件（你 build 之后的前端放在 dist/public）
app.use(express.static(path.join(process.cwd(), "dist/public")));

// ----------------- ① 原来的 /api/top5 -----------------
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

// ----------------- ② 新增 /api/wallet/latest -----------------
/**
 * 返回最新一条钱包 snapshot + token 明细
 * GET /api/wallet/latest
 */
app.get("/api/wallet/latest", async (_req: Request, res: Response) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not configured" });
    }

    // 1) 取最新一条 snapshot
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

    // 2) 取这个 snapshot 的 token 明细
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

// ----------------- health -----------------
app.get("/health", (_req: Request, res: Response) => {
  return res.send("ok");
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
