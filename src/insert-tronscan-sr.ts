// import { Pool } from "pg";
// import { fetchSrSnapshot } from "./tronscan-sr-fetch";

// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: { rejectUnauthorized: false },
// });

// async function main() {
//   try {
//     const data = await fetchSrSnapshot();  

//     const res = await pool.query(
//       `
//       INSERT INTO sr_snapshots (
//         address,
//         name,
//         lastranking,
//         realtimeranking,
//         lastcyclevotes,
//         realtimevotes,
//         changevotes,
//         brokerage,
//         voterbrokerage,
//         votespercentage,
//         lastcyclevotespercentage,
//         witnesstype,
//         annualizedrate,
//         producedtotal,
//         producedefficiency,
//         blockreward,
//         version,
//         reward,
//         claimable_trx,
//         timestamputc,
//         timestamphkt
//       )
//       VALUES (
//         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
//         $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
//       )
//       RETURNING id
//       `,
//       [
//         data.address,
//         data.name,
//         data.lastRanking,
//         data.realTimeRanking,
//         data.lastCycleVotes,
//         data.realTimeVotes,
//         data.changeVotes,
//         data.brokerage,
//         data.voterBrokerage,
//         data.votesPercentage,
//         data.lastCycleVotesPercentage,
//         data.witnessType,
//         Number(data.annualizedRate),
//         data.producedTotal,
//         data.producedEfficiency,
//         data.blockReward,
//         data.version,
//         data.reward,
//         data["Claimable Voter/SR Rewards"],
//         data.timestampUTC,
//         data.timestampHKT,
//       ]
//     );

//     console.log("insert success, id =", res.rows[0].id);
//   } catch (err) {
//     console.error("insert error:", err);
//   } finally {
//     await pool.end();
//   }
// }

// main();

import { Pool } from "pg";
import { fetchSrSnapshot } from "./tronscan-sr-fetch";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {

  try {

    // 现在 fetch 返回 array
    const rows = await fetchSrSnapshot();

    // loop insert
    for (const data of rows) {

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
          timestamputc,
          timestamphkt
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
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
          Number(data.annualizedRate),
          data.producedTotal,
          data.producedEfficiency,
          data.blockReward,
          data.version,
          data.reward,
          data["Claimable Voter/SR Rewards"],
          data.timestampUTC,
          data.timestampHKT,
        ]
      );

      console.log(
        "insert success:",
        res.rows[0].id,
        data.name
      );
    }

  } catch (err) {

    console.error(
      "insert error:",
      err
    );

  } finally {

    await pool.end();

  }
}

main();