import axios from "axios";

const WATCH_ADDRESS = "";

// TEySEZLJf6rs2mCujGpDEsgoMVWKLAk9mT
//THM28kapdZqMkJjEVWxViu8MhjrdyuJqBz

const TG_BOT_TOKEN = "";
const TG_CHAT_ID = "";

// const TG_BOT_TOKEN = "7624574350:AAFQTF-tIW9IREdx-zoUfLYX-VRfjB2aBZY";
// const TG_CHAT_ID = "-5225818932";

// const TG_BOT_TOKEN = "8513438350:AAHDA6dwxmYMF231queT_gzREin3luQSmcQ";
// const TG_CHAT_ID = "-1003712720647";


const INTERVAL = 10_000; 
const seen = new Set<string>();

async function sendTG(msg: string) {
  await axios.post(
    `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`,
    {
      chat_id: TG_CHAT_ID,
      text: msg,
      disable_web_page_preview: true,
    }
  );
}

async function fetchTRC20Transfers(start = 0, limit = 50) {
  const url =
    `https://apilist.tronscan.org/api/filter/trc20/transfers` +
    `?limit=${limit}` +
    `&start=${start}` +
    `&sort=-timestamp` +
    `&count=true` +
    `&filterTokenValue=0` +
    `&relatedAddress=${WATCH_ADDRESS}`;

  const res = await axios.get<any>(url);
  return res.data?.token_transfers || [];
}

function formatMsg(tx: any) {
  const token = tx.tokenInfo;
  const amount =
    Number(tx.quant) / Math.pow(10, token.tokenDecimal || 0);

  return `Incoming TRC20 Transfer

Token:
${token.tokenName} (${token.tokenAbbr})

Amount:
${amount.toLocaleString()}

From:
${tx.from_address}

To:
${tx.to_address}

TxHash:
${tx.transaction_id}

Time:
${new Date(tx.block_ts).toLocaleString()}
`;
}

async function warmupCache() {
  const txs = await fetchTRC20Transfers(0, 50);

  for (const tx of txs) {
    if (tx.transaction_id) {
      seen.add(tx.transaction_id);
    }
  }

  console.log(`Cache warmed with ${seen.size} existing txs`);
}

async function poll() {
  try {
    const txs = await fetchTRC20Transfers(0, 20);

    for (const tx of txs) {
      if (!tx.transaction_id) continue;
      if (seen.has(tx.transaction_id)) continue;

      seen.add(tx.transaction_id);

      const msg = formatMsg(tx);
      console.log(msg);
      await sendTG(msg);
    }
  } catch (e: any) {
    console.error("poll error:", e?.message || e);
  }
}

(async () => {
  console.log("TRC20 Monitor started...");
  await warmupCache();          
  setInterval(poll, INTERVAL);  
})();