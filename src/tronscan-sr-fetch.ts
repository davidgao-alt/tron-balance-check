// import axios from "axios";
// import TronWeb from "tronweb";

// const ADDRESS = "TCEo1hMAdaJrQmvnGTCcGT2LqrGU4N7Jqf";

// type TronscanResponse = {
//   data: {
//     lastRanking: number;
//     realTimeRanking: number;
//     address: string;
//     name: string;
//     lastCycleVotes: number;
//     realTimeVotes: number;
//     changeVotes: number;
//     brokerage: number;
//     voterBrokerage: number;
//     votesPercentage: number;
//     lastCycleVotesPercentage: number;
//     witnessType: number;
//     annualizedRate: string;
//     producedTotal: number;
//     producedEfficiency: number;
//     blockReward: number;
//     version: number;
//   };
// };

// const tronWeb = new TronWeb.TronWeb({
//   fullHost: "https://api.trongrid.io",
// });

// export async function fetchSrSnapshot() {
//   const url = `https://apilist.tronscan.org/api/vote/witness?address=${ADDRESS}`;

//   try {
//     const res = await axios.get<TronscanResponse>(url);
//     const d = res.data.data;

//     const reward = await tronWeb.trx.getReward(ADDRESS);
//     const claimableTRX = reward / 1e6;

//     const timestampUTC = new Date().toISOString();
//     const timestampHKT = new Date()
//       .toLocaleString("sv-SE", { timeZone: "Asia/Hong_Kong" })
//       .replace(" ", "T");

//     return {
//       timestampUTC,
//       timestampHKT,
//       lastRanking: d.lastRanking,
//       realTimeRanking: d.realTimeRanking,
//       address: d.address,
//       name: d.name,
//       lastCycleVotes: d.lastCycleVotes,
//       realTimeVotes: d.realTimeVotes,
//       changeVotes: d.changeVotes,
//       brokerage: d.brokerage,
//       voterBrokerage: d.voterBrokerage,
//       votesPercentage: d.votesPercentage,
//       lastCycleVotesPercentage: d.lastCycleVotesPercentage,
//       witnessType: d.witnessType,
//       annualizedRate: d.annualizedRate,
//       producedTotal: d.producedTotal,
//       producedEfficiency: d.producedEfficiency,
//       blockReward: d.blockReward,
//       version: d.version,
//       reward,
//       "Claimable Voter/SR Rewards": claimableTRX
//     };

//   } catch (err) {
//     console.error("fetch error:", err);
//     throw err;
//   }
// }

// if (require.main === module) {
//   fetchSrSnapshot()
//     .then((out) => console.log(JSON.stringify(out, null, 2)))
//     .catch(console.error);
// }

import axios from "axios";
import TronWeb from "tronweb";

const ADDRESS =
  "TCEo1hMAdaJrQmvnGTCcGT2LqrGU4N7Jqf";

type WitnessData = {
  lastRanking?: number;
  realTimeRanking?: number;
  ranking?: number;

  address: string;
  name: string;

  lastCycleVotes: number;
  realTimeVotes: number;
  changeVotes: number;

  brokerage: number;
  voterBrokerage: number;

  votesPercentage: number;
  lastCycleVotesPercentage?: number;

  witnessType: number;
  annualizedRate: string;

  producedTotal: number;
  producedEfficiency?: number;

  blockReward?: number;
  version: number;
};

const tronWeb = new TronWeb.TronWeb({
  fullHost: "https://api.trongrid.io",
});

// ======================================================
// sleep
// ======================================================

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ======================================================
// build row
// ======================================================

async function buildRow(d: WitnessData) {

  console.log(
    `Fetching: ${d.name}`
  );

  // avoid timeout / rate limit
  await sleep(1000);

  const reward =
    await tronWeb.trx.getReward(
      d.address
    );

  const claimableTRX =
    reward / 1e6;

  const timestampUTC =
    new Date().toISOString();

  const timestampHKT =
    new Date()
      .toLocaleString(
        "sv-SE",
        {
          timeZone:
            "Asia/Hong_Kong"
        }
      )
      .replace(" ", "T");

  return {

    timestampUTC,
    timestampHKT,

    lastRanking:
      d.lastRanking ??
      d.ranking,

    realTimeRanking:
      d.realTimeRanking ??
      d.ranking,

    address:
      d.address,

    name:
      d.name,

    lastCycleVotes:
      d.lastCycleVotes,

    realTimeVotes:
      d.realTimeVotes,

    changeVotes:
      d.changeVotes,

    brokerage:
      d.brokerage,

    voterBrokerage:
      d.voterBrokerage,

    votesPercentage:
      d.votesPercentage,

    lastCycleVotesPercentage:
      d.lastCycleVotesPercentage,

    witnessType:
      d.witnessType,

    annualizedRate:
      d.annualizedRate,

    producedTotal:
      d.producedTotal,

    producedEfficiency:
      d.producedEfficiency,

    blockReward:
      d.blockReward,

    version:
      d.version,

    reward,

    "Claimable Voter/SR Rewards":
      claimableTRX
  };
}

// ======================================================
// main
// ======================================================

export async function fetchSrSnapshot() {

  try {

    const output = [];

    // ==================================================
    // 1. fetch original address
    // ==================================================

    const singleUrl =
      `https://apilist.tronscan.org/api/vote/witness?address=${ADDRESS}`;

    const singleRes: any =
      await axios.get(singleUrl);

    const mainWitness =
      singleRes.data.data;

    const mainRow =
      await buildRow(mainWitness);

    output.push(mainRow);

    // ==================================================
    // 2. fetch top 27 SR
    // ==================================================

    const srRes: any =
      await axios.get(
        "https://apilist.tronscan.org/api/pagewitness",
        {
          params: {
            limit: 50,
            start: 0
          }
        }
      );

    const srList =
      (srRes.data.data || [])
        .sort(
          (a: any, b: any) =>
            a.ranking - b.ranking
        )
        .slice(0, 27);

    // ==================================================
    // 3. append SR rows
    // ==================================================

    for (const sr of srList) {

      const row =
        await buildRow(sr);

      output.push(row);
    }

    return output;

  } catch (err) {

    console.error(
      "fetch error:",
      err
    );

    throw err;
  }
}

// ======================================================
// local test
// ======================================================

if (require.main === module) {

  fetchSrSnapshot()
    .then((out) => {

      console.log(
        JSON.stringify(
          out,
          null,
          2
        )
      );

      console.log(
        `rows = ${out.length}`
      );

    })
    .catch(console.error);
}