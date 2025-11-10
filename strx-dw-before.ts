// strx-dw-before.ts
// 用法：ts-node strx-dw-before.ts YYYY-MM-DD [lookbackHours]
// 例子：ts-node strx-dw-before.ts 2025-11-07
//       ts-node strx-dw-before.ts 2025-11-07 72

import TronWeb from "tronweb";

const BASE = "https://api.trongrid.io";
const CONTRACT = "TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5";
const PAGE_LIMIT = 200;

const SRTX_INTEGER_OUTPUT = false;

function toDecimalString(raw: string | number | bigint, decimals: number): string {
  let s = typeof raw === "bigint" ? raw.toString() : String(raw);
  let neg = false;
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  while (s.length <= decimals) s = "0" + s;
  const intPart = s.slice(0, s.length - decimals);
  const fracPart = s.slice(s.length - decimals);
  return (neg ? "-" : "") + intPart + "." + fracPart;
}

function trimZeros(s: string): string {
  if (!s.includes(".")) return s;
  s = s.replace(/\.?0+$/, "");
  return s === "" || s === "-" ? "0" : s;
}

// 计算 (A/10^aDec) / (B/10^bDec) 并保留 outDec 位小数（返回字符串）
function divScaled(aRaw: string, aDec: number, bRaw: string, bDec: number, outDec: number): string {
  const A = BigInt(aRaw);
  const B = BigInt(bRaw);
  if (B === 0n) return "";
  const scale = BigInt(10) ** BigInt(bDec - aDec + outDec);
  const q = (A * scale) / B;
  const s = toDecimalString(q, outDec);
  return trimZeros(s);
}

// ---------------- TronGrid 请求封装 ----------------
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

const pad = (n: number) => (n < 10 ? "0" + n : "" + n);
function toUTC(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// 解析金额（返回字符串，精确不丢位；另附取整版本）
function parseAmountsExact(ev: any) {
  const r = ev?.result || {};
  const sKeys = ["strxAmount", "tokenAmount", "shares", "mintAmount", "stAmount", "sAmount", "receive_shares"]; // 18位
  const tKeys = ["trxAmount", "amount", "value", "depositAmount", "withdrawAmount", "receive_amount", "balance"]; // 6位

  const pick = (ks: string[]) => {
    for (const k of ks) if (r[k] !== undefined && r[k] !== null) return String(r[k]);
    return null;
  };

  const strxRaw = pick(sKeys); // 18 decimals
  const trxRaw  = pick(tKeys); // 6 decimals

  const strxExact = strxRaw ? toDecimalString(strxRaw, 18) : "";
  const trxExact  = trxRaw  ? toDecimalString(trxRaw, 6)  : "";

  const strxFloor = strxRaw ? (BigInt(strxRaw) / (10n ** 18n)).toString() : "";
  const trxFloor  = trxRaw  ? (BigInt(trxRaw)  / (10n ** 6n)).toString()  : "";


  const ratioStr = (trxRaw && strxRaw) ? divScaled(trxRaw, 6, strxRaw, 18, 15) : "";

  return { strxRaw, trxRaw, strxExact, trxExact, strxFloor, trxFloor, ratioStr };
}

async function fetchDWBefore(tronWeb: any, targetMs: number, lookbackHours: number) {
  const minTs = targetMs - lookbackHours * 3600 * 1000;
  const maxTs = targetMs;

  let fingerprint = "";
  const out: any[] = [];

  while (true) {
    const params: any = {
      only_confirmed: true,
      limit: PAGE_LIMIT,
      min_timestamp: minTs,
      max_timestamp: maxTs,
      order_by: "block_timestamp,desc",
    };
    if (fingerprint) params.fingerprint = fingerprint;

    const res = await httpGet(tronWeb, `/v1/contracts/${CONTRACT}/events`, params);
    const arr: any[] = res?.data || [];

    for (const e of arr) {
      const ts = Number(e.block_timestamp ?? e.timestamp);
      if (
        (e.event_name === "Deposit" || e.event_name === "Withdraw") &&
        Number.isFinite(ts) &&
        ts <= targetMs
      ) {
        out.push(e);
      }
    }

    if (out.length >= 5) break;

    const next = res?.meta?.fingerprint;
    if (!next) break;
    fingerprint = next;
  }

  out.sort((a, b) => {
    const ta = Number(a.block_timestamp ?? a.timestamp);
    const tb = Number(b.block_timestamp ?? b.timestamp);
    return tb - ta; 
  });

  return out.slice(0, 5);
}

async function main() {
  const raw = process.argv.slice(2);
  const joined = raw.join("");
  const dateStr =
    /^\d{4}-\d{2}-\d{2}$/.test(raw[0] || "") ? raw[0] :
    (joined.match(/^\d{4}-\d{2}-\d{2}$/)?.[0] || raw[0]);

  const lookbackHours = Number(raw[1]) || 48;

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    console.error("Usage: ts-node strx-dw-before.ts YYYY-MM-DD [lookbackHours]");
    process.exit(1);
  }

  const targetMs = Date.parse(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(targetMs)) {
    console.error("Invalid date:", dateStr);
    process.exit(1);
  }

  const tronWeb = new (TronWeb as any).TronWeb({ fullHost: BASE });
  const events = await fetchDWBefore(tronWeb, targetMs, lookbackHours);

  if (!events.length) {
    console.log("No Deposit/Withdraw events found in the window.");
    return;
  }

  console.log(`Top ${events.length} Deposit/Withdraw BEFORE ${dateStr} 00:00:00 UTC`);
  console.log("--------------------------------------------------------------------");
  for (const e of events) {
    const ts = Number(e.block_timestamp ?? e.timestamp);
    const txid = e.transaction_id || e.transaction || "";

    const { strxExact, trxExact, strxFloor, trxFloor, ratioStr } = parseAmountsExact(e);


    const outSTRX = SRTX_INTEGER_OUTPUT ? strxFloor : trimZeros(strxExact);
    const outTRX  = trimZeros(trxExact); 

    console.log(
      `time: ${toUTC(ts)} | type: ${e.event_name} | hash: ${txid} | TRX: ${outTRX} | sTRX: ${outSTRX} | Ratio: ${ratioStr}`
    );
  }
}

main().catch((e) => {
  console.error(e?.response?.data || e);
  process.exit(1);
});
