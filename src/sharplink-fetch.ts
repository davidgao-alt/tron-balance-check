// sharplink-fetch.ts

// ====== Nasdaq SBET response types ======

interface SharplinkFromNasdaqRow {
  symbol: string;
  assetClass: string;
  name: string;
  lastSale: string;
  change: string;
  pctChange: string;
  volume: string;
  actions: string;
  url: string;
}

interface NasdaqResp {
  data?: {
    asOf: string | null;
    headers: Record<string, string>;
    rows: SharplinkFromNasdaqRow[];
  };
  message?: {
    dataAsOf?: string;
  };
}

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

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 30_000
): Promise<Response> {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  label: string,
  retries = 3
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url,
        options,
        30_000
      );

      if (res.ok) {
        return res;
      }

      lastError = new Error(
        `${label} HTTP ${res.status}`
      );

      // Do not bother retrying obvious permanent 4xx errors
      // except 408 / 429.
      if (
        res.status >= 400 &&
        res.status < 500 &&
        res.status !== 408 &&
        res.status !== 429
      ) {
        throw lastError;
      }
    } catch (err) {
      lastError = err;
    }

    if (attempt < retries) {
      const delayMs = attempt * 1500;

      console.warn(
        `${label} attempt ${attempt} failed; retrying in ${delayMs}ms...`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delayMs)
      );
    }
  }

  throw lastError;
}

// ===== main =====

export async function fetchSharplinkSnapshot() {
  // Nasdaq SBET
  const sbetUrl =
    "https://api.nasdaq.com/api/quote/watchlist?symbol=sbet%7cstocks&type=Rv";

  // Current SharpLink dashboard ETH endpoint
  const ethUrl =
    "https://www.sharplink.com/api/dashboard/eth-coingecko";

  // Current SharpLink dashboard treasury / mNAV endpoint
  const impactUrl =
    "https://www.sharplink.com/api/dashboard/impact3-data";

  console.log("Fetching SharpLink snapshot...");

  const [sbetRes, ethRes, impactRes] =
    await Promise.all([
      fetchWithRetry(
        sbetUrl,
        {
          headers: buildDefaultHeaders(),
        },
        "nasdaq sbet"
      ),

      fetchWithRetry(
        ethUrl,
        {
          headers: buildSharplinkHeaders(),
        },
        "sharplink eth"
      ),

      fetchWithRetry(
        impactUrl,
        {
          headers: buildSharplinkHeaders(),
        },
        "sharplink impact3-data"
      ),
    ]);

  // ============================
  // Nasdaq / SBET
  // ============================

  const sbetJson =
    (await sbetRes.json()) as NasdaqResp;

  const row = sbetJson.data?.rows?.[0];

  if (!row) {
    throw new Error(
      "Nasdaq SBET rows is empty"
    );
  }

  const sharplink = {
    lastPrice: parseMoney(row.lastSale),
    change: parseMoney(row.change),
    changePercent:
      row.pctChange?.replace("%", "") ?? null,
    volume: parseMoney(row.volume),
    latestDate:
      sbetJson.message?.dataAsOf ?? null,
  };

  // ============================
  // ETH
  // ============================

  const ethJson =
    (await ethRes.json()) as EthCoingeckoResp;

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

  const impactData: any =
    await impactRes.json();

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