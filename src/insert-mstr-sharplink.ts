// src/insert-mstr-sharplink.ts
import { fetchMstrSnapshot } from "./mstr-fetch";
import { fetchSharplinkSnapshot } from "./sharplink-fetch";
import pg from "pg";


export async function insertMstrSharplinkToDB() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing DATABASE_URL");

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false, 
    },
  });
  await client.connect();

  try {
    console.log("Fetching snapshots...");
    const mstr = await fetchMstrSnapshot();
    const { sharplink, eth, impact3 } = await fetchSharplinkSnapshot();

    console.log("Inserting MSTR snapshot...");
    const resultMstr = await client.query(
      `INSERT INTO mstr_snapshots (
        mstr_price,
        market_cap_million,
        enterprise_value_million,
        debt_million,
        pref_million,
        btc_price,
        btc_holdings,
        btc_nav_million,
        btc_nav_number_million,
        mnav
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id`,
      [
        mstr.mstrPrice,
        mstr.marketCap_Million,
        mstr.enterpriseValue_Million,
        mstr.debt_Million,
        mstr.pref_Million,
        mstr.btcPrice,
        mstr.btcHoldings,
        mstr.btcNav_Million,
        mstr.btcNavNumber_Million,
        mstr.mnav,
      ]
    );

    const mstrId = resultMstr.rows[0].id;
    console.log(`MSTR saved id = ${mstrId}`);

    console.log("Inserting Sharplink snapshot...");

    let ethDate: Date | null = null;
    if (eth.timestamp) {
      const d = new Date(eth.timestamp);
      if (!isNaN(d.getTime())) ethDate = d;
    }

    const resultSharplink = await client.query(
      `INSERT INTO sharplink_snapshots (
        sharplink_last_price,
        sharplink_latest_date,
        sharplink_latest_value,
        sharplink_change,
        sharplink_change_percent,
        sharplink_avg_volume_30day,
        eth_last_price,
        eth_latest_date,
        eth_latest_value,
        eth_change,
        eth_change_percent,
        impact3_date,
        impact3_market_cap,
        impact3_total_eth_holdings,
        impact3_eth_nav,
        impact3_basic_mnav,
        impact3_fully_diluted_mnav,
        impact3_enterprise_value
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,$18
      )
      RETURNING id`,
      [
  
        sharplink.lastPrice,      // sharplink_last_price
        sharplink.latestDate,     // sharplink_latest_date（你要的 “Data as of ...” 文本）
        sharplink.lastPrice,      // sharplink_latest_value
        sharplink.change,         // sharplink_change
        sharplink.changePercent,  // sharplink_change_percent
        sharplink.volume ?? null, // sharplink_avg_volume_30day


        eth.lastPrice,            // eth_last_price
        ethDate,                  // eth_latest_date
        eth.lastPrice,            // eth_latest_value
        eth.change24h,            // eth_change
        eth.changePercent,        // eth_change_percent

        impact3.date,             // impact3_date
        impact3.marketCap,        // impact3_market_cap
        impact3.totalEthHoldings, // impact3_total_eth_holdings
        impact3.ethNav,           // impact3_eth_nav
        impact3.basicMnav,        // impact3_basic_mnav
        impact3.fullyDilutedMnav, // impact3_fully_diluted_mnav
        impact3.enterpriseValue,  // impact3_enterprise_value
      ]
    );

    const sharplinkId = resultSharplink.rows[0].id;
    console.log(`Sharplink saved id = ${sharplinkId}`);
    console.log("Done");

    return { mstrId, sharplinkId };
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  insertMstrSharplinkToDB()
    .then((ids) => {
      console.log("Inserted snapshot ids:", ids);
    })
    .catch((err) => {
      console.error("Unexpected failure", err);
      process.exit(1);
    });
}