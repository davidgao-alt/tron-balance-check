// sharplink-fetch.ts

// SharpLink ETH API response can evolve,
// so keep this slightly flexible.
interface EthCoingeckoResp {
  price?: number;
  formattedPrice?: string;
  rawPrice?: number;
  change24h?: number;
  changePercent?: string | number;
  timestamp?: string;
  coin?: string;

  ethereum?: {
    usd?: number;
    usd_24h_change?: number;
    last_updated_at?: number;
  };
}

// ===== helper =====

function parseMoney(v: any): number | null {
  if (v == null) return null;

  if (typeof v === "number") {
    return Number.isFinite(v) ? v : null;
  }

  const s = String(v).trim();

  if (!s || s === "--") {
    return null;
  }

  const cleaned = s.replace(/[$,]/g, "");

  const m = cleaned.match(/-?\d+(\.\d+)?/);

  if (!m) return null;

  const n = Number(m[0]);

  return Number.isFinite(n) ? n : null;
}

function buildDefaultHeaders(): HeadersInit {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
  };
}

function buildSharplinkHeaders(): HeadersInit {
  return {
    ...buildDefaultHeaders(),
    Accept: "application/json",
    Referer: "https://www.sharplink.com/dashboard",
  };
}

// ===== fetch with timeout / retry =====

// Decode and validate the body within the timeout and retry boundary.
class PermanentHttpError extends Error {}

async function fetchJsonWithRetry<T>(
  url: string,
  options: RequestInit,
  label: string,
  validate?: (data: T) => void,
  attempts = 4
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      if (!res.ok) {
        void res.body?.cancel().catch(() => {});
        const message = `${label} HTTP ${res.status}`;
        if (res.status >= 400 && res.status < 500 &&
            res.status !== 408 && res.status !== 429) {
          throw new PermanentHttpError(message);
        }
        throw new Error(message);
      }
      const data = await res.json() as T;
      validate?.(data);
      return data;
    } catch (err) {
      if (err instanceof PermanentHttpError) throw err;
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < attempts) {
      const delayMs = 1500 * 2 ** (attempt - 1);
      console.warn(`${label} attempt ${attempt}/${attempts} failed: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }; retrying in ${delayMs}ms`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${
    lastError instanceof Error ? lastError.message : String(lastError)
  }`);
}

// Yahoo chartPreviousClose is the close before the requested RANGE, not
// necessarily yesterday's close. Use the preceding daily bar instead.
export function parseYahooQuote(payload: any) {
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta;
  const price = meta?.regularMarketPrice;
  const time = meta?.regularMarketTime;
  if (payload?.chart?.error || meta?.symbol !== "SBET" || meta?.currency !== "USD" ||
      typeof price !== "number" || !Number.isFinite(price) || price <= 0 ||
      typeof time !== "number" || !Number.isFinite(time) || time <= 0) {
    throw new Error("Yahoo SBET returned no valid USD quote");
  }
  const dateKey = (seconds: number) => new Date(seconds * 1000)
    .toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const quoteDay = dateKey(time);
  const timestamps = result.timestamp;
  const bars = result.indicators?.quote?.[0];
  if (!Array.isArray(timestamps) || !Array.isArray(bars?.close)) {
    throw new Error("Yahoo SBET daily history missing");
  }
  const history = timestamps.map((t: number, i: number) => ({
    time: t, day: dateKey(t), close: bars.close[i], volume: bars.volume?.[i],
  })).sort((a: any, b: any) => a.time - b.time);
  const previous = history.filter((bar: any) => bar.day < quoteDay &&
    typeof bar.close === "number" && Number.isFinite(bar.close) && bar.close > 0).pop();
  if (!previous) throw new Error("Yahoo SBET previous session close missing");
  // Exclude an in-progress session from the 30-session average.
  const sessionEnd = meta.currentTradingPeriod?.regular?.end;
  const completed = history.filter((bar: any) =>
    (bar.day < quoteDay || (bar.day === quoteDay &&
      typeof sessionEnd === "number" && time >= sessionEnd)) &&
    typeof bar.volume === "number" && Number.isFinite(bar.volume) && bar.volume >= 0
  ).slice(-30);
  const change = price - previous.close;
  return {
    lastPrice: price,
    change: Number(change.toFixed(6)),
    changePercent: (change / previous.close * 100).toFixed(6),
    volume: typeof meta.regularMarketVolume === "number" ? meta.regularMarketVolume : null,
    averageVolume30Day: completed.length === 30
      ? completed.reduce((sum: number, bar: any) => sum + bar.volume, 0) / 30 : null,
    latestDate: new Date(time * 1000).toISOString(),
    source: "yahoo-finance",
  };
}

// ===== main =====

export async function fetchSharplinkSnapshot() {
  // Yahoo Finance SBET (daily history also supplies previous close and average volume)
  const sbetUrl =
    "https://query1.finance.yahoo.com/v8/finance/chart/SBET?interval=1d&range=3mo";

  // Current SharpLink dashboard ETH endpoint
  const ethUrl =
    "https://www.sharplink.com/api/dashboard/eth-coingecko";

  // Current SharpLink dashboard treasury / mNAV endpoint
  const impactUrl =
    "https://www.sharplink.com/api/dashboard/impact3-data";

  console.log("Fetching SharpLink snapshot...");

  const [sbetJson, ethJson, impactData] =
    await Promise.all([
      fetchJsonWithRetry<any>(
        sbetUrl,
        {
          headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json, text/plain, */*" },
        },
        "yahoo sbet",
        parseYahooQuote
      ),

      fetchJsonWithRetry<EthCoingeckoResp>(
        ethUrl,
        {
          headers: buildSharplinkHeaders(),
        },
        "sharplink eth"
      ),

      fetchJsonWithRetry<any>(
        impactUrl,
        {
          headers: buildSharplinkHeaders(),
        },
        "sharplink impact3-data"
      ),
    ]);

  const sharplink = parseYahooQuote(sbetJson);

  // ============================
  // ETH
  // ============================


  // Support both the existing SharpLink response shape
  // and standard CoinGecko-style response, just in case.
  const ethPrice =
    parseMoney(ethJson.price) ??
    parseMoney(ethJson.rawPrice) ??
    parseMoney(ethJson.ethereum?.usd);

  if (ethPrice == null) {
    throw new Error(
      "SharpLink ETH API returned no valid ETH price"
    );
  }

  let ethChangePercent: string | null = null;

  if (ethJson.changePercent != null) {
    ethChangePercent = String(
      ethJson.changePercent
    ).replace("%", "");
  } else if (
    typeof ethJson.ethereum
      ?.usd_24h_change === "number"
  ) {
    ethChangePercent =
      ethJson.ethereum.usd_24h_change.toString();
  }

  let ethChange24h =
    parseMoney(ethJson.change24h);

  // If API gives % change but not dollar change,
  // derive the absolute 24h change.
  if (
    ethChange24h == null &&
    ethChangePercent != null
  ) {
    const pct = Number(ethChangePercent);

    if (
      Number.isFinite(pct) &&
      pct > -100
    ) {
      const previousPrice =
        ethPrice / (1 + pct / 100);

      ethChange24h =
        ethPrice - previousPrice;
    }
  }

  let ethTimestamp =
    ethJson.timestamp ?? null;

  if (
    !ethTimestamp &&
    typeof ethJson.ethereum
      ?.last_updated_at === "number"
  ) {
    ethTimestamp = new Date(
      ethJson.ethereum.last_updated_at *
        1000
    ).toISOString();
  }

  const eth = {
    lastPrice: ethPrice,
    change24h: ethChange24h,
    changePercent: ethChangePercent,
    timestamp: ethTimestamp,
  };

  // ============================
  // SharpLink impact3
  // ============================


  const totalEthHoldingsArr =
    impactData.total_eth_holdings ?? [];

  const ethNavArr =
    impactData.eth_nav ?? [];

  const mnavDataArr =
    impactData.mnav_data ?? [];

  const fdMnavArr =
    impactData.fdmnav ?? [];

  const disclaimerArr =
    impactData.disclaimer_data ?? [];

  const sharplinkNavArr =
    impactData["Sharplink NAV"] ?? [];

  const basicNavPerShareArr =
    impactData[
      "Basic-equivalent NAV per share"
    ] ?? [];

  // Latest weekly ETH data
  const latestEthHoldings =
    totalEthHoldingsArr[
      totalEthHoldingsArr.length - 1
    ];

  const latestEthNav =
    ethNavArr[
      ethNavArr.length - 1
    ];

  const latestSharplinkNav =
    sharplinkNavArr[
      sharplinkNavArr.length - 1
    ];

  const latestBasicNavPerShare =
    basicNavPerShareArr[
      basicNavPerShareArr.length - 1
    ];

  // Current mNAV data
  const basicMnavSource =
    mnavDataArr[0];

  const fdMnavSource =
    fdMnavArr[0];

  const disclaimer =
    disclaimerArr[0];

  // ============================
  // Extract official values
  // ============================

  const totalEthHoldings =
    parseMoney(
      latestEthHoldings?.[
        "Total ETH Holdings"
      ]
    );

  const ethNav =
    parseMoney(
      latestEthNav?.["ETH NAV"]
    );

  /*
   * IMPORTANT:
   *
   * Current API gives the official Basic mNAV
   * directly as:
   *
   * mnav_data[0]["mNAV"]
   *
   * Example:
   * "0.86x"
   *
   * Do NOT calculate it from Enterprise Value.
   */
  const basicMnav =
    parseMoney(
      basicMnavSource?.["mNAV"]
    );

  const fullyDilutedMnav =
    parseMoney(
      fdMnavSource?.[
        "Fully Diluted mNAV"
      ]
    );

  const marketCap =
    parseMoney(
      fdMnavSource?.["Market Cap"]
    );

  const enterpriseValue =
    parseMoney(
      fdMnavSource?.[
        "Enterprise Value"
      ]
    );

  const sharplinkNav =
    parseMoney(
      basicMnavSource?.[
        "Sharplink NAV"
      ] ??
        latestSharplinkNav?.[
          "Sharplink NAV"
        ]
    );

  const basicEquivalentNavPerShare =
    parseMoney(
      basicMnavSource?.[
        "Basic-equivalent NAV per share"
      ] ??
        latestBasicNavPerShare?.[
          "Basic-equivalent NAV per share"
        ]
    );

  const date =
    disclaimer?.["Disclaimer Date"] ??
    basicMnavSource?.["Date"] ??
    fdMnavSource?.["Date"] ??
    latestEthHoldings?.["Date"] ??
    latestEthNav?.["Date"] ??
    null;

  // Basic sanity checks so bad API responses
  // don't silently enter the database.
  if (totalEthHoldings == null) {
    throw new Error(
      "SharpLink total ETH holdings missing"
    );
  }

  if (ethNav == null) {
    throw new Error(
      "SharpLink ETH NAV missing"
    );
  }

  if (basicMnav == null) {
    throw new Error(
      "SharpLink Basic mNAV missing"
    );
  }

  if (fullyDilutedMnav == null) {
    throw new Error(
      "SharpLink Fully Diluted mNAV missing"
    );
  }

  const impact3 = {
    date,
    marketCap,
    totalEthHoldings,
    ethNav,
    basicMnav,
    fullyDilutedMnav,
    enterpriseValue,

    // Extra fields available from current official API.
    // Keep them if useful; remove these two lines if your
    // downstream TypeScript type requires the old exact shape.
    sharplinkNav,
    basicEquivalentNavPerShare,
  };

  return {
    sharplink,
    eth,
    impact3,
  };
}

// ===== standalone test =====

if (require.main === module) {
  fetchSharplinkSnapshot()
    .then((result) => {
      console.log(
        JSON.stringify(result, null, 2)
      );
    })
    .catch((err) => {
      console.error(
        "Error",
        err
      );
      process.exit(1);
    });
}