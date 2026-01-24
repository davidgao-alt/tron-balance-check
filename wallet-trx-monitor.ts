import "dotenv/config";
import axios from "axios";
import { TronWeb } from "tronweb";

const tronWeb = new TronWeb({
  fullHost: process.env.TRON_RPC || "https://api.trongrid.io"
});

const WATCH_ADDRESS = process.env.WATCH_ADDRESS as string;
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN as string;
const TG_CHAT_ID = process.env.TG_CHAT_ID as string;

if (!WATCH_ADDRESS || !TG_BOT_TOKEN || !TG_CHAT_ID) {
  throw new Error("Missing env vars: WATCH_ADDRESS / TG_BOT_TOKEN / TG_CHAT_ID");
}

const seen = new Set<string>();
const INTERVAL = 4000;

function sunToTRX(n: number) {
  return Number(tronWeb.fromSun(n || 0));
}

async function sendTG(msg: string) {
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: TG_CHAT_ID,
    text: msg,
    disable_web_page_preview: true
  });
}

async function fetchTxs() {
  const url = `https://apilist.tronscan.org/api/transaction?sort=-timestamp&count=true&limit=20&start=0&address=${WATCH_ADDRESS}`;
  const res = await axios.get<any>(url);
  return res.data?.data || [];
}

async function poll() {
  try {
    const txs = await fetchTxs();

    for (const tx of txs) {
      if (seen.has(tx.hash)) continue;
      seen.add(tx.hash);

      if (tx.contractType !== 1) continue;
      if (tx.toAddress !== WATCH_ADDRESS) continue;

      const amount = sunToTRX(tx.amount || 0);

      const msg = `Incoming TRX

Amount:
${amount.toLocaleString()} TRX

From:
${tx.ownerAddress}

Hash:
${tx.hash}

Time:
${new Date(tx.timestamp).toLocaleString()}
`;

      console.log(msg);
      await sendTG(msg);
    }
  } catch (e) {
    console.error("poll error:", e);
  }
}

console.log("Tron TRX Monitor started...");
setInterval(poll, INTERVAL);


// import axios from "axios";
// import { TronWeb } from "tronweb";

// const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io" });

// const WATCH_ADDRESS = "";
// const TG_BOT_TOKEN = "";
// const TG_CHAT_ID = "";

// const seen = new Set<string>();
// const INTERVAL = 4000;

// function sunToTRX(n: number) {
//   return Number(tronWeb.fromSun(n || 0));
// }

// async function sendTG(msg: string) {
//   const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
//   await axios.post(url, {
//     chat_id: TG_CHAT_ID,
//     text: msg,
//     disable_web_page_preview: true
//   });
// }

// async function fetchTxs() {
//   const url = `https://apilist.tronscan.org/api/transaction?sort=-timestamp&count=true&limit=20&start=0&address=${WATCH_ADDRESS}`;
//   const res = await axios.get<any>(url);
//   return res.data?.data || [];
// }

// async function poll() {
//   try {
//     const txs = await fetchTxs();

//     for (const tx of txs) {
//       if (seen.has(tx.hash)) continue;
//       seen.add(tx.hash);

//       if (tx.contractType !== 1) continue;
//       if (tx.toAddress !== WATCH_ADDRESS) continue;

//       const amount = sunToTRX(tx.amount || 0);

//       const msg = `Incoming TRX

// Amount:
// ${amount.toLocaleString()} TRX

// From:
// ${tx.ownerAddress}

// Hash:
// ${tx.hash}

// Time:
// ${new Date(tx.timestamp).toLocaleString()}
// `;

//       console.log(msg);
//       await sendTG(msg);
//     }
//   } catch (e) {
//     console.error("poll error:", e);
//   }
// }

// console.log("Tron TRX Monitor started...");
// setInterval(poll, INTERVAL);