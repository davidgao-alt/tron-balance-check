
// sharplink-fetch.ts

// ====== Nasdaq SBET response types ======
interface SharplinkFromNasdaqRow {
  symbol: string;
  assetClass: string;
  name: string;
  lastSale: string;   // "$10.62"
  change: string;     // "+0.37"
  pctChange: string;  // "+3.61%"
  volume: string;     // "6,107,964"
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
    dataAsOf?: string; // "Data as of Nov 29, 2025 12:00 AM ET"
  };
  status?: {
    rCode: number;
  };
}

interface EthCoingeckoResp {
  price: number;
  formattedPrice: string;
  rawPrice: number;
  change24h: number;
  changePercent: string;
  timestamp: string;
  coin: string;
}


function parseMoney(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : null;
  }
  const s = String(v).trim();
  // 去掉 $ 和逗号
  const cleaned = s.replace(/[$,]/g, "");
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function buildSbetHeaders(): HeadersInit {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://sbet-eth-dash.vercel.app/",
    Origin: "https://sbet-eth-dash.vercel.app",
    Connection: "keep-alive",
  };
}

export async function fetchSharplinkSnapshot() {
  const sbetUrl =
    "https://api.nasdaq.com/api/quote/watchlist?symbol=sbet%7cstocks&type=Rv";

  // 2) ETH 价格（eth-coingecko）
  const ethUrl = "https://sbet-eth-dash.vercel.app/api/eth-coingecko";

  // 3) impact3（ETH 持仓 / ETH NAV / mNAV）
  const impactUrl = "https://sbet-eth-dash.vercel.app/api/impact3-data";

  const [sbetRes, ethRes, impactRes] = await Promise.all([

    fetch(sbetUrl),
    fetch(ethUrl, { headers: buildSbetHeaders() }),
    fetch(impactUrl, { headers: buildSbetHeaders() }),
  ]);

  if (!sbetRes.ok) throw new Error(`nasdaq sbet HTTP ${sbetRes.status}`);
  if (!ethRes.ok) throw new Error(`eth HTTP ${ethRes.status}`);
  if (!impactRes.ok) throw new Error(`impact3-data HTTP ${impactRes.status}`);

  const sbetJson = (await sbetRes.json()) as NasdaqResp;
  const row = sbetJson.data?.rows?.[0];
  if (!row) throw new Error("Nasdaq SBET rows is empty");

  const sbetLastPrice = parseMoney(row.lastSale); // 10.62
  const sbetChange = parseMoney(row.change);      // 0.37
  const sbetPctChangeStr =
    typeof row.pctChange === "string"
      ? row.pctChange.replace("%", "").trim()
      : String(row.pctChange ?? "");
  const sbetVolume = parseMoney(row.volume);      // 6107964

  const sharplink = {
    lastPrice: sbetLastPrice,
    change: sbetChange,
    changePercent: sbetPctChangeStr, 
    volume: sbetVolume,
    latestDate: sbetJson.message?.dataAsOf ?? null,
  };

  const ethJson = (await ethRes.json()) as EthCoingeckoResp;

  const eth = {
    lastPrice: ethJson.price ?? ethJson.rawPrice ?? null,
    change24h: ethJson.change24h ?? null,
    changePercent: ethJson.changePercent ?? null,
    timestamp: ethJson.timestamp ?? null,
  };

  const impactData: any = await impactRes.json();

  const totalEthHoldingsArr = impactData.total_eth_holdings ?? [];
  const ethNavArr = impactData.eth_nav ?? [];
  const mnavDataArr = impactData.mnav_data ?? [];
  const fdMnavArr = impactData.fdmnav ?? [];
  const disclaimerArr = impactData.disclaimer_data ?? [];

  const latestEthHoldings =
    totalEthHoldingsArr[totalEthHoldingsArr.length - 1];
  const latestEthNav = ethNavArr[ethNavArr.length - 1];
  const basicMnavSource = mnavDataArr[0];
  const fdMnavSource = fdMnavArr[0];
  const disclaimer = disclaimerArr[0];

  const totalEthHoldings =
    latestEthHoldings?.["Total ETH Holdings"] ?? null;
  const ethNav = latestEthNav?.["ETH NAV"] ?? null;

  const marketCap = parseMoney(fdMnavSource?.["Market Cap"]);
  const enterpriseValue = parseMoney(fdMnavSource?.["Enterprise Value"]);

  const basicEv = parseMoney(basicMnavSource?.["Enterprise Value"]);
  const basicNav = parseMoney(basicMnavSource?.["NAV"]);
  const basicMnav =
    basicEv != null && basicNav != null
      ? Number((basicEv / basicNav).toFixed(2))
      : null;

  const fullyDilutedMnavRaw =
    (fdMnavSource?.["Fully Diluted mNAV"] as string | undefined) ?? null;
  const fullyDilutedMnav = fullyDilutedMnavRaw
    ? Number(
        fullyDilutedMnavRaw
          .replace(/[^\d.+-]/g, "") 
          .trim()
      )
    : null;

  const date =
    disclaimer?.["Disclaimer Date"] ??
    latestEthHoldings?.["Date"] ??
    latestEthNav?.["Date"] ??
    basicMnavSource?.["Date"] ??
    fdMnavSource?.["Date"] ??
    null;

  const impact3 = {
    date,
    marketCap,
    totalEthHoldings,
    ethNav,
    basicMnav,
    fullyDilutedMnav,
    enterpriseValue,
  };

  return {
    sharplink,
    eth,
    impact3,
  };
}

if (require.main === module) {
  fetchSharplinkSnapshot()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error("Error", err);
      process.exit(1);
    });
}