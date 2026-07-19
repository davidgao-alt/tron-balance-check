import axios from "axios";
import pg from "pg";
import "dotenv/config";

const CMC_URL =
  "https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest";

async function insertCmcUsdtToDB() {
  const databaseUrl = process.env.DATABASE_URL;
  const cmcApiKey = process.env.CMC_API_KEY;

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL");
  }

  if (!cmcApiKey) {
    throw new Error("Missing CMC_API_KEY");
  }

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  await client.connect();

  try {
    console.log("Fetching CMC USDT snapshot...");

    const response = await axios.get<any>(CMC_URL, {
      params: {
        id: 825,
        convert: "USD",
      },
      headers: {
        Accept: "application/json",
        "X-CMC_PRO_API_KEY": cmcApiKey,
      },
      timeout: 60000,
    });

    const usdt = response.data?.data?.["825"];

    if (!usdt) {
      throw new Error(
        `USDT data not found: ${JSON.stringify(response.data)}`
      );
    }

    console.log("Inserting CMC USDT snapshot...");

    const result = await client.query(
      `
      INSERT INTO cmc_usdt_supply_snapshots (
        cmc_id,
        name,
        last_updated,
        circulating_supply,
        total_supply
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [
        usdt.id,
        usdt.name,
        usdt.last_updated,
        usdt.circulating_supply,
        usdt.total_supply,
      ]
    );

    const id = result.rows[0].id;

    console.log(`CMC USDT snapshot saved id = ${id}`);

    return id;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  insertCmcUsdtToDB()
    .then((id) => {
      console.log("Inserted snapshot id:", id);
    })
    .catch((err) => {
      console.error("Unexpected failure:", err);
      process.exit(1);
    });
}

export { insertCmcUsdtToDB };