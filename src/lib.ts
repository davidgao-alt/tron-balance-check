import TronWeb from "tronweb";
import axios from "axios";

export const BASE = "https://api.trongrid.io";
export const CONTRACT = "TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5";
export const PAGE_LIMIT = 200;
export const SRTX_INTEGER_OUTPUT = false;

export function toDecimalString(raw: string | number | bigint, decimals: number): string {
  let s = typeof raw === "bigint" ? raw.toString() : String(raw);
  let neg = false;
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  while (s.length <= decimals) s = "0" + s;
  const intPart = s.slice(0, s.length - decimals);
  const fracPart = s.slice(s.length - decimals);
  return (neg ? "-" : "") + intPart + "." + fracPart;
}

export function trimZeros(s: string): string {
  if (!s.includes(".")) return s;
  s = s.replace(/\.?0+$/, "");
  return s === "" || s === "-" ? "0" : s;
}

export function divScaled(aRaw: string, aDec: number, bRaw: string, bDec: number, outDec: number): string {
  const A = BigInt(aRaw);
  const B = BigInt(bRaw);
  if (B === 0n) return "";
  const scale = BigInt(10) ** BigInt(bDec - aDec + outDec);
  const q = (A * scale) / B;
  const s = toDecimalString(q, outDec);
  return trimZeros(s);
}

const pad = (n: number) => (n < 10 ? "0" + n : "" + n);
export function toUTC(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// ---- axios 调 Trongrid v1 ----
const client = axios.create({ baseURL: BASE, timeout: 30000 });
export async function httpGet(path: string, params: Record<string, any> = {}) {
  const headers: Record<string, string> = {};
  if (process.env.TRON_PRO_API_KEY) headers["TRON-PRO-API-KEY"] = process.env.TRON_PRO_API_KEY;
  const res = await client.get(path, { params, headers });
  return res.data;
}

export function parseAmountsExact(ev: any) {
  const r = ev?.result || {};
  const sKeys = ["strxAmount","tokenAmount","shares","mintAmount","stAmount","sAmount","receive_shares"];
  const tKeys = ["trxAmount","amount","value","depositAmount","withdrawAmount","receive_amount","balance"];
  const pick = (ks: string[]) => { for (const k of ks) if (r[k] != null) return String(r[k]); return null; };

  const strxRaw = pick(sKeys);
  const trxRaw  = pick(tKeys);
  const strxExact = strxRaw ? toDecimalString(strxRaw, 18) : "";
  const trxExact  = trxRaw  ? toDecimalString(trxRaw, 6)  : "";
  const strxFloor = strxRaw ? (BigInt(strxRaw) / (10n ** 18n)).toString() : "";
  const trxFloor  = trxRaw  ? (BigInt(trxRaw)  / (10n ** 6n)).toString()  : "";
  const ratioStr = (trxRaw && strxRaw) ? divScaled(trxRaw, 6, strxRaw, 18, 15) : "";
  return { strxRaw, trxRaw, strxExact, trxExact, strxFloor, trxFloor, ratioStr };
}

export async function fetchDWBefore(_tronWeb: any, targetMs: number, lookbackHours: number) {
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

    const res = await httpGet(`/v1/contracts/${CONTRACT}/events`, params);
    const arr: any[] = res?.data || [];

    for (const e of arr) {
      const ts = Number(e.block_timestamp ?? e.timestamp);
      if ((e.event_name === "Deposit" || e.event_name === "Withdraw") && Number.isFinite(ts) && ts <= targetMs) {
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

export function newTronWeb() {
  return new (TronWeb as any).TronWeb({ fullHost: BASE });
}