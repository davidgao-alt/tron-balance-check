import { Pool } from "pg";
import { execSync } from "child_process";

// ======================================================
// postgres
// ======================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// ======================================================
// main
// ======================================================

async function main() {

  try {

    // ==================================================
    // run python script
    // ==================================================

    const raw = execSync(
      "python3 src/kelp-rseth-fetch.py",
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 20,
      }
    );

    // ==================================================
    // extract json
    // ==================================================

    const jsonStart =
      raw.indexOf("[");

    const jsonText =
      raw.slice(jsonStart);

    const data =
      JSON.parse(jsonText);

    // ==================================================
    // insert rows
    // ==================================================

    for (const row of data) {

      const res =
        await pool.query(
          `
          INSERT INTO kelp_rseth_supply_snapshots (

            timestamp_hkt,
            chain,
            rpc,
            address,
            raw_supply,
            total_supply,
            status

          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7
          )
          RETURNING id
          `,
          [
            row.timestamp_hkt,
            row.chain,
            row.rpc,
            row.address,
            row.raw_supply,
            row.total_supply,
            row.status,
          ]
        );

      console.log(
        `insert success: ${res.rows[0].id} ${row.chain}`
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