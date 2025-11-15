// snapshot.ts
import axios from "axios";
import { Client } from "pg";

const ADDRESS = "TEySEZLJf6rs2mCujGpDEsgoMVWKLAk9mT"; // sTRX 合约那个钱包
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  throw new Error("Missing DATABASE_URL env var");
}

// ---- 第 1 步：调用 Tronscan API 拿 JSON ----
async function fetchWalletJson() {
  const url = "https://apilist.tronscan.org/api/account/tokens/v2";

  const params = {
    address: ADDRESS,
    start: 0,
    limit: 20,
    hidden: 1,
    show: 3,
    showAvailable: 0,
    sortType: 0,
    sortBy: 2,
    assetType: 1,
    card: 0,
  };

  const headers = {
    accept: "application/json, text/plain, */*",
    origin: "https://tronscan.org",
    referer: "https://tronscan.org/",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    secret:
      "NDE3YTg1YmU4MDBjMThmY2IxNTYzOGU4MDRjNTJlZjUzOWQ0MTkyNWUxMDI0ZDViMjRkZGMwYWE1MmE3NjA4Nw==",
    // 你之前 Network 里抓到的 t；如果后面 401，可以改成 Date.now().toString()
    t: "1763051673361",
  };

  const res = await axios.get(url, { params, headers });

  return res.data as any;
}

// ---- 第 2 步：写入 Postgres ----
async function main() {
  const json = await fetchWalletJson();

  const totalAssetsRaw = String(json.totalAssetsInUsd);
  const totalAssets = parseFloat(totalAssetsRaw);

  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }, // Render 外部连接要开 SSL
  });

  await client.connect();

  // 1) 插入 snapshot 总表
  const snapRes = await client.query(
    `
    INSERT INTO wallet_snapshots
      (address, total_assets_usd, total_assets_usd_raw, source, raw_json)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id;
    `,
    [ADDRESS, totalAssets, totalAssetsRaw, "tronscan", json]
  );

  const snapshotId: number = snapRes.rows[0].id;
  console.log("Inserted snapshot id =", snapshotId);

  // 2) 插入 token 明细（TRX / sTRX）
  const ratioList: any[] = json.ratioList || [];
  const data: any[] = json.data || [];

  for (const tok of data) {
    const tokenId = tok.tokenId as string;
    const tokenName = tok.tokenName as string;
    const tokenAbbr = tok.tokenAbbr as string;
    const tokenType = tok.tokenType as string;
    const tokenDecimal = tok.tokenDecimal as number;

    const balanceRaw = tok.balance != null ? String(tok.balance) : null;
    const amountUsdRaw = tok.amountInUsd != null ? String(tok.amountInUsd) : null;
    const priceUsdRaw = tok.tokenPriceInUsd != null ? String(tok.tokenPriceInUsd) : null;

    const balance = balanceRaw ? parseFloat(balanceRaw) : null;
    const amountUsd = amountUsdRaw ? parseFloat(amountUsdRaw) : null;
    const priceUsd = priceUsdRaw ? parseFloat(priceUsdRaw) : null;

    const ratioRow = ratioList.find((r) => r.tokenId === tokenId);
    const usdRatio = ratioRow ? parseFloat(ratioRow.ratio) : null;

    const isTrx = tokenId === "_";
    const isStrx = tokenId === "TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5";

    await client.query(
      `
      INSERT INTO wallet_tokens
        (snapshot_id, token_id, token_name, token_abbr, token_type, token_decimal,
         balance, balance_raw, amount_usd, amount_usd_raw, price_usd, price_usd_raw,
         usd_ratio, is_trx, is_strx)
      VALUES
        ($1,$2,$3,$4,$5,$6,
         $7,$8,$9,$10,$11,$12,
         $13,$14,$15);
      `,
      [
        snapshotId,
        tokenId,
        tokenName,
        tokenAbbr,
        tokenType,
        tokenDecimal,
        balance,
        balanceRaw,
        amountUsd,
        amountUsdRaw,
        priceUsd,
        priceUsdRaw,
        usdRatio,
        isTrx,
        isStrx,
      ]
    );
  }

  await client.end();
  console.log("Inserted", data.length, "token rows");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});