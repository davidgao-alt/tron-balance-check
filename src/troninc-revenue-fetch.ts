// src/troninc-revenue-fetch.ts
//
// Snapshot of the Tron Inc. revenue wallet:
// - TronGrid (on-chain): TRX available / staked / unstaking, energy, bandwidth,
//   votes, claimable voter/SR rewards, sTRX balance
// - Tronscan: assets list with USD prices, SR names for the votes
//
// Local dry run (prints the row, writes nothing):
//   npx ts-node src/troninc-revenue-fetch.ts

import axios from "axios";
import TronWeb from "tronweb";
import { toDecimalString } from "./lib";

export const ADDRESS = "TEb4gXicQ39VWN3jbeXygEJJV1McRWg4uZ";

// sTRX (JustLend staked TRX)
const STRX_CONTRACT = "TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5";

const TRONGRID_BASE_URL = "https://api.trongrid.io";
const TRONSCAN_BASE_URL = "https://apilist.tronscan.org";

const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY || "";
const TRONSCAN_API_KEY = process.env.TRONSCAN_API_KEY || "";

if (!TRONGRID_API_KEY) {
  console.warn("Warning: TRONGRID_API_KEY is not set. TronGrid may rate limit requests.");
}

if (!TRONSCAN_API_KEY) {
  console.warn("Warning: TRONSCAN_API_KEY is not set. The Tronscan assets list will be skipped.");
}

// ======================================================
// http helpers
// ======================================================

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries rate limits (429), server errors and network errors.
async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.response?.status;
      const retryable = !status || status === 429 || status >= 500;

      if (!retryable || attempt >= tries) {
        throw err;
      }

      const waitMs = 3000 * attempt;
      console.log(`${label} failed (${status ?? err?.code ?? err?.message}), retry in ${waitMs / 1000}s...`);
      await sleep(waitMs);
    }
  }
}

async function tronGridPost(path: string, body: Record<string, any>): Promise<any> {
  return withRetry(`TronGrid ${path}`, async () => {
    const res = await axios.post<any>(
      `${TRONGRID_BASE_URL}${path}`,
      { ...body, visible: true },
      {
        headers: {
          "content-type": "application/json",
          ...(TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": TRONGRID_API_KEY } : {}),
        },
        timeout: 20_000,
      }
    );

    return res.data;
  });
}

async function tronscanGet(path: string, params: Record<string, any>): Promise<any> {
  return withRetry(`Tronscan ${path}`, async () => {
    const res = await axios.get<any>(`${TRONSCAN_BASE_URL}${path}`, {
      params,
      headers: { "TRON-PRO-API-KEY": TRONSCAN_API_KEY },
      timeout: 20_000,
    });

    return res.data;
  });
}

const sunToTrx = (sun: bigint) => toDecimalString(sun, 6);

const big = (value: any) => BigInt(value ?? 0);

// ======================================================
// TronGrid: account, resources, reward
// ======================================================

// Staked amounts in SUN: Stake 2.0 plus legacy Stake 1.0 (older accounts still hold it).
// frozenV2 entries without a type are BANDWIDTH.
function stakeFromAccount(account: any, nowMs: number) {
  const resource = account.account_resource || {};

  let energy = big(resource.frozen_balance_for_energy?.frozen_balance);
  let bandwidth = 0n;
  let tronPower = 0n;

  for (const f of account.frozen || []) {
    bandwidth += big(f.frozen_balance);
  }

  for (const f of account.frozenV2 || []) {
    const amount = big(f.amount);
    if (f.type === "ENERGY") energy += amount;
    else if (f.type === "TRON_POWER") tronPower += amount;
    else bandwidth += amount;
  }

  const delegatedBandwidth =
    big(account.delegated_frozenV2_balance_for_bandwidth) +
    big(account.delegated_frozen_balance_for_bandwidth);
  const delegatedEnergy =
    big(resource.delegated_frozenV2_balance_for_energy) +
    big(resource.delegated_frozen_balance_for_energy);

  let unstaking = 0n;
  let withdrawable = 0n;

  for (const u of account.unfrozenV2 || []) {
    const amount = big(u.unfreeze_amount);
    if (Number(u.unfreeze_expire_time ?? 0) > nowMs) unstaking += amount;
    else withdrawable += amount;
  }

  const stakedEnergy = energy + delegatedEnergy;
  const stakedBandwidth = bandwidth + delegatedBandwidth;

  return {
    staked: stakedEnergy + stakedBandwidth + tronPower,
    stakedEnergy,
    stakedBandwidth,
    delegatedOut: delegatedEnergy + delegatedBandwidth,
    unstaking,
    withdrawable,
  };
}

// getaccountresource returns usage already recovered up to the latest block.
function resourcesFrom(resource: any) {
  const energyLimit = Number(resource.EnergyLimit ?? 0);
  const energyUsed = Number(resource.EnergyUsed ?? 0);
  const bandwidthLimit = Number(resource.freeNetLimit ?? 0) + Number(resource.NetLimit ?? 0);
  const bandwidthUsed = Number(resource.freeNetUsed ?? 0) + Number(resource.NetUsed ?? 0);

  return {
    energyLimit,
    energyUsed,
    energyAvailable: Math.max(energyLimit - energyUsed, 0),
    bandwidthLimit,
    bandwidthUsed,
    bandwidthAvailable: Math.max(bandwidthLimit - bandwidthUsed, 0),
    votePower: Number(resource.tronPowerLimit ?? 0),
  };
}

// ======================================================
// sTRX balance (read-only contract calls)
// ======================================================

async function callConstant(address: string, selector: string, parameter = ""): Promise<string> {
  const data = await tronGridPost("/wallet/triggerconstantcontract", {
    owner_address: address,
    contract_address: STRX_CONTRACT,
    function_selector: selector,
    parameter,
  });

  const result = data?.constant_result?.[0];

  if (!data?.result?.result || typeof result !== "string") {
    throw new Error(`sTRX ${selector} failed: ${JSON.stringify(data?.result ?? data)}`);
  }

  return result;
}

async function fetchStrxBalance(address: string) {
  const decimals = Number(BigInt("0x" + (await callConstant(address, "decimals()"))));

  // balanceOf(address): 20-byte address (hex without the 41 prefix), left-padded to 32 bytes
  const addressHex = (TronWeb as any).TronWeb.address.toHex(address).slice(2);
  const raw = BigInt("0x" + (await callConstant(address, "balanceOf(address)", addressHex.padStart(64, "0"))));

  return { raw: raw.toString(), decimals, balance: toDecimalString(raw, decimals) };
}

// ======================================================
// Tronscan: assets list and SR names (optional)
// ======================================================

async function fetchAssets(address: string) {
  if (!TRONSCAN_API_KEY) return null;

  try {
    const data = await tronscanGet("/api/account/wallet", { address, asset_type: 0 });

    if (!Array.isArray(data?.data)) {
      throw new Error(`unexpected response: ${JSON.stringify(data).slice(0, 300)}`);
    }

    const assets = data.data.map((t: any) => ({
      token_id: t.token_id,
      token_name: t.token_name,
      token_abbr: t.token_abbr,
      token_type: t.token_type, // 0 = TRX, 10 = TRC10, 20 = TRC20
      token_decimal: t.token_decimal,
      balance: t.balance,
      price_usd: t.token_price_in_usd ?? null,
      value_usd: t.token_value_in_usd ?? null,
    }));

    return { assets, raw: data };
  } catch (err: any) {
    console.warn("Tronscan assets list skipped:", err?.message || err);
    return null;
  }
}

async function fetchSrNames(): Promise<Record<string, string>> {
  try {
    const data = await tronscanGet("/api/pagewitness", { start: 0, limit: 200 });
    const names: Record<string, string> = {};
    for (const w of data?.data || []) names[w.address] = w.name;
    return names;
  } catch (err: any) {
    console.warn("Tronscan SR names skipped:", err?.message || err);
    return {};
  }
}

// ======================================================
// main fetch
// ======================================================

export async function fetchTronIncRevenueSnapshot(address = ADDRESS) {
  const now = new Date();

  const account = await tronGridPost("/wallet/getaccount", { address });

  if (!account?.address) {
    throw new Error(`TronGrid returned no account for ${address}: ${JSON.stringify(account)}`);
  }

  const resource = await tronGridPost("/wallet/getaccountresource", { address });
  const reward = await tronGridPost("/wallet/getReward", { address });
  const strx = await fetchStrxBalance(address);
  const tronscan = await fetchAssets(address);

  const stake = stakeFromAccount(account, now.getTime());
  const res = resourcesFrom(resource);

  const available = big(account.balance);
  const total = available + stake.staked + stake.unstaking + stake.withdrawable;

  const accountVotes: any[] = account.votes || [];
  const srNames = accountVotes.length ? await fetchSrNames() : {};

  const votes = accountVotes.map((v) => ({
    sr_address: v.vote_address,
    sr_name: srNames[v.vote_address] ?? null,
    votes: Number(v.vote_count ?? 0),
  }));

  // USD: all TRX (incl. staked) at the TRX price, plus every other token's USD value.
  let trxPriceUsd: number | null = null;
  let totalAssetsUsd: number | null = null;

  if (tronscan) {
    const trxRow = tronscan.assets.find((a: any) => a.token_id === "_");
    const price = Number(trxRow?.price_usd);

    if (Number.isFinite(price)) {
      trxPriceUsd = price;
      totalAssetsUsd =
        Number(sunToTrx(total)) * price +
        tronscan.assets
          .filter((a: any) => a.token_id !== "_")
          .reduce((sum: number, a: any) => sum + (Number(a.value_usd) || 0), 0);
    }
  }

  return {
    snapshotTimeUtc: now.toISOString(),
    snapshotTimeHkt: now.toLocaleString("sv-SE", { timeZone: "Asia/Hong_Kong" }).replace(" ", "T"),
    address,

    trxAvailable: sunToTrx(available),
    trxStaked: sunToTrx(stake.staked),
    trxStakedEnergy: sunToTrx(stake.stakedEnergy),
    trxStakedBandwidth: sunToTrx(stake.stakedBandwidth),
    trxDelegatedOut: sunToTrx(stake.delegatedOut),
    trxUnstaking: sunToTrx(stake.unstaking),
    trxWithdrawable: sunToTrx(stake.withdrawable),
    trxTotal: sunToTrx(total),

    energyLimit: res.energyLimit,
    energyUsed: res.energyUsed,
    energyAvailable: res.energyAvailable,
    bandwidthLimit: res.bandwidthLimit,
    bandwidthUsed: res.bandwidthUsed,
    bandwidthAvailable: res.bandwidthAvailable,

    votePower: res.votePower,
    votesUsed: votes.reduce((sum, v) => sum + v.votes, 0),
    votes,

    claimableRewardTrx: sunToTrx(big(reward?.reward)),
    strxBalance: strx.balance,

    trxPriceUsd,
    totalAssetsUsd: totalAssetsUsd === null ? null : totalAssetsUsd.toFixed(6),
    assets: tronscan?.assets ?? null,

    rawJson: {
      fetched_at: now.toISOString(),
      trongrid: { account, resource, reward, strx },
      tronscan_wallet: tronscan?.raw ?? null,
    },
  };
}

// ======================================================
// local test
// ======================================================

if (require.main === module) {
  // optional: another address to test with, e.g. npx ts-node src/troninc-revenue-fetch.ts T...
  fetchTronIncRevenueSnapshot(process.argv[2] || ADDRESS)
    .then((row) => {
      const { rawJson, ...summary } = row;
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((err) => {
      console.error("fetch error:", err?.message || err);
      process.exit(1);
    });
}
