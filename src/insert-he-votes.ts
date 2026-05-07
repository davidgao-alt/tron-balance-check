import { Pool } from "pg";
import { fetchHeVotes } from "./fetch-he-votes";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function main() {

  try {

    const rows = await fetchHeVotes();

    for (const row of rows) {

      // insert aggregate
      const snapshotRes = await pool.query(
        `
        INSERT INTO he_vote_snapshots (
          snapshot_time_utc,
          candidate_name,
          candidate_ranking,
          candidate_address,
          candidate_url,
          he_votes,
          candidate_total_votes,
          pct
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8
        )
        RETURNING id
        `,
        [
          row.timestampUtc,
          row.candidateName,
          row.candidateRanking,
          row.candidateAddress,
          row.candidateUrl,
          row.heVotes,
          row.candidateTotalVotes,
          parseFloat(
            String(row.pct).replace("%", "")
          ),
        ]
      );

      const snapshotId =
        snapshotRes.rows[0].id;

      // insert details
      for (const d of row.details) {

        await pool.query(
          `
          INSERT INTO he_vote_details (
            snapshot_id,
            vote_timestamp,
            voter_address,
            candidate_name,
            candidate_address,
            candidate_url,
            votes,
            candidate_total_votes
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8
          )
          `,
          [
            snapshotId,
            d.timestamp,
            d.voterAddress,
            d.candidateName,
            d.candidateAddress,
            d.candidateUrl,
            d.votes,
            d.candidateTotalVotes,
          ]
        );
      }

      console.log(
        `inserted ${row.candidateName}`
      );
    }

    console.log("\nDONE\n");

  } catch (err) {

    console.error(err);

  } finally {

    await pool.end();
  }
}

main();