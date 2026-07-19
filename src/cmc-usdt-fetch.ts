import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const CMC_API_KEY = process.env.CMC_API_KEY;

if (!CMC_API_KEY) {
  throw new Error("Missing CMC_API_KEY in .env");
}

const CMC_URL =
  "https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest";

async function fetchUsdtSupply(): Promise<void> {
  try {
    const response = await axios.get<any>(CMC_URL, {
      params: {
        id: "825",
        convert: "USD",
      },
      headers: {
        Accept: "application/json",
        "X-CMC_PRO_API_KEY": CMC_API_KEY,
      },
      timeout: 60_000,
    });

    const token = response.data?.data?.["825"];

    if (!token) {
      throw new Error(
        `USDT data not found: ${JSON.stringify(response.data)}`
      );
    }

    const output = {
      id: token.id ?? null,
      name: token.name ?? null,
      last_updated: token.last_updated ?? null,
      circulating_supply: token.circulating_supply ?? null,
      total_supply: token.total_supply ?? null,
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error: any) {
    if (error.response) {
      console.error("CMC HTTP status:", error.response.status);
      console.error(
        "CMC response:",
        JSON.stringify(error.response.data, null, 2)
      );
    } else {
      console.error(
        "CMC request failed:",
        error instanceof Error ? error.message : String(error)
      );
    }

    process.exitCode = 1;
  }
}

fetchUsdtSupply();