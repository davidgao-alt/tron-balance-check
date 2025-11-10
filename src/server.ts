import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import rateLimit from "express-rate-limit";
import {
  fetchDWBefore,
  newTronWeb,
  parseAmountsExact,
  toUTC,
  SRTX_INTEGER_OUTPUT,
  trimZeros,
} from "./lib";

const app = express();

// CORS + JSON
app.use(cors());
app.use(express.json());

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
  })
);

app.use(express.static(path.join(process.cwd(), "dist/public")));

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


app.get("/health", (_req: Request, res: Response) => {
  return res.send("ok");
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
