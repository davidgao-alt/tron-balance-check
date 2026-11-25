// src/insert-tronscan-sr.ts

import { Pool } from "pg";
import { fetchMatrixSnapshot, MATRIX_ADDRESS } from "./tron-matrix-fetch";
import { fetchSrSnapshot } from "./tronscan-sr-fetch";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

type Snapshot = Partial<Awaited<ReturnType<typeof fetchSrSnapshot>>[number]> & {
  address: string;
  accountStatus?: string;
  walletSnapshot?: object;
};

async function insertSnapshot(data: Snapshot) {
  const res = await pool.query(
    `
    INSERT INTO sr_snapshots (
      address,
      name,
      lastranking,
      realtimeranking,
      lastcyclevotes,
      realtimevotes,
      changevotes,
      brokerage,
      voterbrokerage,
      votespercentage,
      lastcyclevotespercentage,
      witnesstype,
      annualizedrate,
      producedtotal,
      producedefficiency,
      blockreward,
      version,
      reward,
      claimable_trx,
      trx_balance,
      timestamputc,
      timestamphkt,
      account_status,
      wallet_snapshot
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24
    )
    RETURNING id
    `,
    [
      data.address,
      data.name,
      data.lastRanking,
      data.realTimeRanking,
      data.lastCycleVotes,
      data.realTimeVotes,
      data.changeVotes,
      data.brokerage,
      data.voterBrokerage,
      data.votesPercentage,
      data.lastCycleVotesPercentage,
      data.witnessType,
      data.annualizedRate ?? null,
      data.producedTotal,
      data.producedEfficiency,
      data.blockReward,
      data.version,
      data.reward,
      data["Claimable Voter/SR Rewards"],
      data.trxBalance,
      data.timestampUTC,
      data.timestampHKT,
      data.accountStatus ?? null,
      data.walletSnapshot ?? null,
    ]
  );

  console.log(
    "insert success:",
    res.rows[0].id,
    data.name,
    "trx_balance:",
    data.trxBalance
  );
}

export async function runSrSnapshots() {
  const failures: string[] = [];
  let matrixSaved = false;
  try {
    try {
      const matrix = await fetchMatrixSnapshot();
      await insertSnapshot(matrix);
      matrixSaved = true;
      if (matrix.witnessDetailUnavailable) failures.push("Tron Matrix witness details");
    } catch (err) {
      console.error("Tron Matrix snapshot failed:", err instanceof Error ? err.message : "unknown error");
      failures.push("Tron Matrix");
    }
    // If Matrix collection failed, the existing Top 27 path can still save its SR metrics.
    try {
      const rows = await fetchSrSnapshot(matrixSaved ? MATRIX_ADDRESS : undefined);
      for (const row of rows) await insertSnapshot(row);
    } catch (err) {
      console.error("SR snapshot failed:", err instanceof Error ? err.message : "unknown error");
      failures.push("SR");
    }
    if (failures.length) throw new Error(`Snapshot failures: ${failures.join(", ")}`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) runSrSnapshots().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
