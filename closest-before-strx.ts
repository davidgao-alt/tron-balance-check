// recent3-events.ts
import TronWeb from "tronweb";

const BASE = "https://api.trongrid.io";
const CONTRACT = "TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5";
const LIMIT = 3;

async function httpGet(tronWeb: any, path: string, params: Record<string, any> = {}) {
  try {
    return await tronWeb.fullNode.request(path, params, "get");
  } catch {
    try {
      return await tronWeb.fullNode.request("get", path, params);
    } catch {
      return await tronWeb.fullNode.request({ method: "get", url: path, params });
    }
  }
}

function toUTC(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => (n < 10 ? "0" + n : n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function parseAmounts(ev: any) {
  const r = ev?.result || {};
  const sCandidates = ["tokenAmount", "stAmount", "sAmount", "shares", "mintAmount", "receive_shares", "strxAmount"];
  const tCandidates = ["receive_amount", "trxAmount", "amount", "value", "withdrawAmount", "depositAmount", "balance"];

  const pick = (keys: string[]) => {
    for (const k of keys) {
      if (r[k] !== undefined && r[k] !== null) return r[k];
    }
    return null;
  };

  const rawStrx = pick(sCandidates);
  const rawTrx = pick(tCandidates);

  const strx = rawStrx != null ? Number(rawStrx) / 1e18 : null;
  const trx = rawTrx != null ? Number(rawTrx) / 1e6 : null;
  const ratio = strx && trx ? trx / strx : null;

  return { trx, strx, ratio };
}

async function fetchRecentDWEvents(tronWeb: any) {
  const res = await httpGet(tronWeb, `/v1/contracts/${CONTRACT}/events`, {
    limit: 50,                         // 拉多一点，便于过滤
    only_confirmed: true,
    order_by: "block_timestamp,desc",
  });

  const all = res?.data || [];

  // ✅ 过滤 Deposit / Withdraw
  const dw = all.filter(
    (e: any) => e.event_name === "Deposit" || e.event_name === "Withdraw"
  );

  return dw.slice(0, LIMIT);
}

async function main() {
  const tronWeb = new (TronWeb as any).TronWeb({ fullHost: BASE });

  const events = await fetchRecentDWEvents(tronWeb);

  if (!events || events.length === 0) {
    console.log("No Deposit/Withdraw events found.");
    return;
  }

  console.log(`Latest ${events.length} Deposit/Withdraw events for ${CONTRACT}`);
  console.log("------------------------------------------------------------------");

  for (const e of events) {
    const ts = Number(e.block_timestamp ?? e.timestamp);
    const txid = e.transaction_id || e.transaction;
    const name = e.event_name;

    const { trx, strx, ratio } = parseAmounts(e);

    console.log(
      [
        `time: ${toUTC(ts)}`,
        `event: ${name}`,
        `txid: ${txid}`,
        `TRX: ${trx ?? ""}`,
        `sTRX: ${strx ?? ""}`,
        `Ratio: ${ratio ?? ""}`,
      ].join(" | ")
    );
  }
}

main().catch((e) => {
  console.error(e?.response?.data || e);
  process.exit(1);
});
