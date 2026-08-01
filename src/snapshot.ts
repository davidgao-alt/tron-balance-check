// src/snapshot.ts

import axios from "axios";
import { Client } from "pg";

const ADDRESS = "TEySEZLJf6rs2mCujGpDEsgoMVWKLAk9mT";

// sTRX contract
const STRX_CONTRACT = "TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5";

// CoinMarketCap IDs
const TRX_CMC_ID = "1958";
const STRX_CMC_ID = "24875";

const TRONGRID_BASE_URL = "https://api.trongrid.io";
const CMC_QUOTES_URL =
  "https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest";

const DB_URL = process.env.DATABASE_URL;
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY;
const CMC_API_KEY = process.env.CMC_API_KEY;

if (!DB_URL) {
  throw new Error("Missing DATABASE_URL env var");
}

if (!TRONGRID_API_KEY) {
  throw new Error("Missing TRONGRID_API_KEY env var");
}

if (!CMC_API_KEY) {
  throw new Error("Missing CMC_API_KEY env var");
}

const tronGridHeaders = {
  accept: "application/json",
  "TRON-PRO-API-KEY": TRONGRID_API_KEY,
};

/**
 * Convert a raw integer balance into an exact decimal string.
 *
 * Example:
 * raw = "1234567", decimals = 6
 * result = "1.234567"
 */
function formatTokenBalance(rawValue: string, decimals: number): string {
  let raw = rawValue.trim();

  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid raw token balance: ${rawValue}`);
  }

  // Remove unnecessary leading zeroes, but preserve one zero.
  raw = raw.replace(/^0+(?=\d)/, "");

  if (decimals === 0) {
    return raw;
  }

  const padded = raw.padStart(decimals + 1, "0");
  const wholePart = padded.slice(0, -decimals);
  const fractionalPart = padded.slice(-decimals).replace(/0+$/, "");

  return fractionalPart
    ? `${wholePart}.${fractionalPart}`
    : wholePart;
}

function formatNumeric(value: number, decimals = 8): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  return value.toFixed(decimals);
}

/**
 * Get native TRX balance.
 *
 * TronGrid returns balance in SUN:
 * 1 TRX = 1,000,000 SUN.
 */
async function fetchTrxBalance() {
  const url = `${TRONGRID_BASE_URL}/v1/accounts/${ADDRESS}`;

  const response = await axios.get<any>(url, {
    headers: tronGridHeaders,
    params: {
      only_confirmed: true,
    },
    timeout: 15_000,
  });

  const account = response.data?.data?.[0];

  if (!account) {
    throw new Error(`TronGrid returned no account data for ${ADDRESS}`);
  }

  const rawBalanceSun = String(account.balance ?? "0");
  const balanceRaw = formatTokenBalance(rawBalanceSun, 6);
  const balance = Number(balanceRaw);

  if (!Number.isFinite(balance)) {
    throw new Error(`Invalid TRX balance returned by TronGrid: ${balanceRaw}`);
  }

  return {
    rawBalanceSun,
    balanceRaw,
    balance,
    rawResponse: response.data,
  };
}

/**
 * Get the sTRX contract decimals by calling decimals().
 *
 * This is a read-only contract call and does not consume wallet funds,
 * Energy, or Bandwidth.
 */
async function fetchStrxDecimals(): Promise<number> {
  const url = `${TRONGRID_BASE_URL}/wallet/triggerconstantcontract`;

  const response = await axios.post<any>(
    url,
    {
      contract_address: STRX_CONTRACT,
      function_selector: "decimals()",
      owner_address: ADDRESS,
      visible: true,
    },
    {
      headers: {
        ...tronGridHeaders,
        "content-type": "application/json",
      },
      timeout: 15_000,
    }
  );

  const resultHex = response.data?.constant_result?.[0];

  if (!resultHex) {
    throw new Error(
      `Unable to read sTRX decimals: ${JSON.stringify(response.data)}`
    );
  }

  const decimals = Number.parseInt(resultHex, 16);

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
    throw new Error(`Invalid sTRX decimals returned: ${decimals}`);
  }

  return decimals;
}

/**
 * Get the raw sTRX balance for the wallet.
 */
async function fetchStrxBalance(decimals: number) {
  const url =
    `${TRONGRID_BASE_URL}/v1/accounts/` +
    `${ADDRESS}/trc20/balance`;

  const response = await axios.get<any>(url, {
    headers: tronGridHeaders,
    params: {
      contract_address: STRX_CONTRACT,
      limit: 20,
    },
    timeout: 15_000,
  });

  const data = response.data?.data;
  let rawBalance: string | null = null;

  /*
   * TronGrid normally returns an array containing maps such as:
   *
   * [
   *   {
   *     "TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5": "123456789"
   *   }
   * ]
   *
   * The additional checks below make the parser tolerant of
   * slightly different response structures.
   */
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== "object") {
        continue;
      }

      if (item[STRX_CONTRACT] != null) {
        rawBalance = String(item[STRX_CONTRACT]);
        break;
      }

      if (
        item.contract_address === STRX_CONTRACT &&
        item.balance != null
      ) {
        rawBalance = String(item.balance);
        break;
      }
    }
  } else if (data && typeof data === "object") {
    if (data[STRX_CONTRACT] != null) {
      rawBalance = String(data[STRX_CONTRACT]);
    }
  }

  /*
   * TronGrid may omit a TRC-20 token when its balance is zero.
   */
  if (rawBalance == null) {
    rawBalance = "0";
  }

  const balanceRaw = formatTokenBalance(rawBalance, decimals);
  const balance = Number(balanceRaw);

  if (!Number.isFinite(balance)) {
    throw new Error(`Invalid sTRX balance returned: ${balanceRaw}`);
  }

  return {
    rawBalance,
    balanceRaw,
    balance,
    rawResponse: response.data,
  };
}

/**
 * Fetch both TRX and Staked TRX prices from CMC in one request.
 */
async function fetchCmcPrices() {
  const response = await axios.get<any>(CMC_QUOTES_URL, {
    headers: {
      accept: "application/json",
      "X-CMC_PRO_API_KEY": CMC_API_KEY,
    },
    params: {
      id: `${TRX_CMC_ID},${STRX_CMC_ID}`,
      convert: "USD",
    },
    timeout: 15_000,
  });

  function getCmcAsset(id: string): any {
    const value = response.data?.data?.[id];

    // Defensive handling in case CMC returns an array.
    return Array.isArray(value) ? value[0] : value;
  }

  const trxAsset = getCmcAsset(TRX_CMC_ID);
  const strxAsset = getCmcAsset(STRX_CMC_ID);

  const trxPrice = Number(trxAsset?.quote?.USD?.price);
  const strxPrice = Number(strxAsset?.quote?.USD?.price);

  if (!Number.isFinite(trxPrice)) {
    throw new Error(
      `CMC returned an invalid TRX price: ${JSON.stringify(trxAsset)}`
    );
  }

  if (!Number.isFinite(strxPrice)) {
    throw new Error(
      `CMC returned an invalid sTRX price: ${JSON.stringify(strxAsset)}`
    );
  }

  return {
    trxPrice,
    strxPrice,
    trxLastUpdated: trxAsset?.last_updated ?? null,
    strxLastUpdated: strxAsset?.last_updated ?? null,
    rawResponse: response.data,
  };
}

function describeError(error: unknown): string {
  const err = error as any;

  const status = err?.response?.status;
  const responseData = err?.response?.data;
  const message = err?.message || String(error);

  return [
    message,
    status ? `HTTP ${status}` : null,
    responseData != null ? JSON.stringify(responseData) : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function main() {
  console.log("Fetching TRX balance from TronGrid...");
  const trx = await fetchTrxBalance();

  console.log("Fetching sTRX decimals from TronGrid...");
  const strxDecimals = await fetchStrxDecimals();

  console.log("Fetching sTRX balance from TronGrid...");
  const strx = await fetchStrxBalance(strxDecimals);

  console.log("Fetching TRX and sTRX prices from CoinMarketCap...");
  const prices = await fetchCmcPrices();

  const trxAmountUsd = trx.balance * prices.trxPrice;
  const strxAmountUsd = strx.balance * prices.strxPrice;
  const totalAssets = trxAmountUsd + strxAmountUsd;

  const totalAssetsRaw = formatNumeric(totalAssets);

  const tokens = [
    {
      tokenId: "_",
      tokenName: "TRON",
      tokenAbbr: "TRX",
      tokenType: "trx",
      tokenDecimal: 6,

      balance: trx.balance,
      balanceRaw: trx.balanceRaw,

      amountUsd: trxAmountUsd,
      amountUsdRaw: formatNumeric(trxAmountUsd),

      priceUsd: prices.trxPrice,
      priceUsdRaw: formatNumeric(prices.trxPrice),

      usdRatio: totalAssets > 0
        ? trxAmountUsd / totalAssets
        : null,

      isTrx: true,
      isStrx: false,
    },
    {
      tokenId: STRX_CONTRACT,
      tokenName: "Staked TRX",
      tokenAbbr: "sTRX",
      tokenType: "trc20",
      tokenDecimal: strxDecimals,

      balance: strx.balance,
      balanceRaw: strx.balanceRaw,

      amountUsd: strxAmountUsd,
      amountUsdRaw: formatNumeric(strxAmountUsd),

      priceUsd: prices.strxPrice,
      priceUsdRaw: formatNumeric(prices.strxPrice),

      usdRatio: totalAssets > 0
        ? strxAmountUsd / totalAssets
        : null,

      isTrx: false,
      isStrx: true,
    },
  ];

  console.log(
    JSON.stringify(
      {
        address: ADDRESS,
        trx: {
          balance: trx.balanceRaw,
          price_usd: prices.trxPrice,
          amount_usd: trxAmountUsd,
        },
        strx: {
          balance: strx.balanceRaw,
          decimals: strxDecimals,
          price_usd: prices.strxPrice,
          amount_usd: strxAmountUsd,
        },
        total_assets_usd: totalAssets,
      },
      null,
      2
    )
  );

  const rawJson = {
    source: "trongrid_cmc",
    fetched_at: new Date().toISOString(),
    address: ADDRESS,

    balances: {
      trx: {
        raw_sun: trx.rawBalanceSun,
        formatted: trx.balanceRaw,
      },
      strx: {
        contract_address: STRX_CONTRACT,
        raw_balance: strx.rawBalance,
        formatted: strx.balanceRaw,
        decimals: strxDecimals,
      },
    },

    prices: {
      trx: {
        cmc_id: TRX_CMC_ID,
        usd: prices.trxPrice,
        last_updated: prices.trxLastUpdated,
      },
      strx: {
        cmc_id: STRX_CMC_ID,
        usd: prices.strxPrice,
        last_updated: prices.strxLastUpdated,
      },
    },

    trongrid_raw: {
      account: trx.rawResponse,
      strx_balance: strx.rawResponse,
    },

    cmc_raw: prices.rawResponse,
  };

  const client = new Client({
    connectionString: DB_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    const snapRes = await client.query(
      `
      INSERT INTO wallet_snapshots
        (
          address,
          total_assets_usd,
          total_assets_usd_raw,
          source,
          raw_json
        )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
      `,
      [
        ADDRESS,
        totalAssets,
        totalAssetsRaw,
        "trongrid_cmc",
        rawJson,
      ]
    );

    const snapshotId = snapRes.rows[0].id;

    console.log("Inserted snapshot id =", snapshotId);

    for (const token of tokens) {
      await client.query(
        `
        INSERT INTO wallet_tokens
          (
            snapshot_id,
            token_id,
            token_name,
            token_abbr,
            token_type,
            token_decimal,
            balance,
            balance_raw,
            amount_usd,
            amount_usd_raw,
            price_usd,
            price_usd_raw,
            usd_ratio,
            is_trx,
            is_strx
          )
        VALUES
          (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12,
            $13, $14, $15
          );
        `,
        [
          snapshotId,
          token.tokenId,
          token.tokenName,
          token.tokenAbbr,
          token.tokenType,
          token.tokenDecimal,

          token.balance,
          token.balanceRaw,

          token.amountUsd,
          token.amountUsdRaw,

          token.priceUsd,
          token.priceUsdRaw,

          token.usdRatio,
          token.isTrx,
          token.isStrx,
        ]
      );
    }

    await client.query("COMMIT");

    console.log(`Inserted ${tokens.length} token rows`);
    console.log("Wallet snapshot completed successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  /*
   * Do not console.error the complete Axios object because that can
   * expose API keys and produce thousands of lines in Render logs.
   */
  console.error("Wallet snapshot failed:", describeError(error));
  process.exit(1);
});