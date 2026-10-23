// src/insert-troninc-revenue.ts
//
// Cron entry point: fetch one Tron Inc. revenue wallet snapshot and insert it
// into troninc_revenue_snapshots (table: sql/troninc_revenue_snapshots.sql).
//
// Env: DATABASE_URL, TRONGRID_API_KEY, TRONSCAN_API_KEY

import { Client } from "pg";
import { fetchTronIncRevenueSnapshot } from "./troninc-revenue-fetch";

const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  throw new Error("Missing DATABASE_URL env var");
}

async function main() {
  const row = await fetchTronIncRevenueSnapshot();

  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const res = await client.query(
      `
      INSERT INTO troninc_revenue_snapshots (
        snapshot_time_utc,
        snapshot_time_hkt,
        address,
        trx_available,
        trx_staked,
        trx_staked_energy,
        trx_staked_bandwidth,
        trx_delegated_out,
        trx_unstaking,
        trx_withdrawable,
        trx_total,
        energy_limit,
        energy_used,
        energy_available,
        bandwidth_limit,
        bandwidth_used,
        bandwidth_available,
        vote_power,
        votes_used,
        votes,
        claimable_reward_trx,
        strx_balance,
        trx_price_usd,
        total_assets_usd,
        assets,
        raw_json
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26
      )
      RETURNING id
      `,
      [
        row.snapshotTimeUtc,
        row.snapshotTimeHkt,
        row.address,
        row.trxAvailable,
        row.trxStaked,
        row.trxStakedEnergy,
        row.trxStakedBandwidth,
        row.trxDelegatedOut,
        row.trxUnstaking,
        row.trxWithdrawable,
        row.trxTotal,
        row.energyLimit,
        row.energyUsed,
        row.energyAvailable,
        row.bandwidthLimit,
        row.bandwidthUsed,
        row.bandwidthAvailable,
        row.votePower,
        row.votesUsed,
        JSON.stringify(row.votes),
        row.claimableRewardTrx,
        row.strxBalance,
        row.trxPriceUsd,
        row.totalAssetsUsd,
        row.assets === null ? null : JSON.stringify(row.assets),
        JSON.stringify(row.rawJson),
      ]
    );

    console.log(
      "insert success:",
      res.rows[0].id,
      "trx_total:",
      row.trxTotal,
      "claimable:",
      row.claimableRewardTrx,
      "assets:",
      row.assets === null ? "skipped" : row.assets.length
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("insert error:", err?.message || err);
  process.exit(1);
});
