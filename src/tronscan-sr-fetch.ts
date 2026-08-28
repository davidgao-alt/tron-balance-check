// src/tronscan-sr-fetch.ts

import axios from "axios";
import TronWeb from "tronweb";

// ======================================================
// tracked address
// ======================================================

const ADDRESS =
  "TGydWLsWzUnYG6fPvrVeMSs1UJBTTFgXY3";

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

// ======================================================
// TronGrid
// ======================================================

const TRONGRID_API_KEY =
  process.env.TRONGRID_API_KEY || "";

const tronWeb = new TronWeb.TronWeb({
  fullHost: "https://api.trongrid.io",
});

// ======================================================
// set TronGrid API key
// ======================================================

if (TRONGRID_API_KEY) {
  tronWeb.setHeader({
    "TRON-PRO-API-KEY": TRONGRID_API_KEY,
  });
} else {
  console.warn(
    "Warning: TRONGRID_API_KEY is not set. TronGrid may rate limit requests."
  );
}

// ======================================================
// sleep
// ======================================================

function sleep(ms: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

// ======================================================
// get reward safely
// ======================================================

async function getRewardSafe(
  address: string
): Promise<number> {
  const maxRetries = 5;

  for (let i = 0; i < maxRetries; i++) {
    try {
      // 每个地址之间停 3 秒
      await sleep(3000);

      const reward =
        await tronWeb.trx.getReward(address);

      return Number(reward);
    } catch (err: any) {
      const status =
        err?.response?.status;

      const msg =
        err?.response?.data?.Error ||
        err?.response?.data ||
        err?.message;

      if (status === 429) {
        const waitMs =
          10000 + i * 5000;

        console.log(
          `429 rate limit for ${address}, wait ${waitMs / 1000}s then retry...`
        );

        await sleep(waitMs);

        continue;
      }

      console.error(
        `getReward failed for ${address}:`,
        msg
      );

      throw err;
    }
  }

  throw new Error(
    `getReward failed after retries: ${address}`
  );
}

// ======================================================
// build row
// ======================================================

async function buildRow(
  d: WitnessData
) {
  console.log(
    `Fetching: ${
      d.ranking ??
      d.realTimeRanking ??
      d.lastRanking ??
      "-"
    } - ${d.name}`
  );

  const reward =
    await getRewardSafe(d.address);

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
            "Asia/Hong_Kong",
        }
      )
      .replace(" ", "T");

  return {
    timestampUTC,
    timestampHKT,

    lastRanking:
      d.lastRanking ??
      d.ranking ??
      null,

    realTimeRanking:
      d.realTimeRanking ??
      d.ranking ??
      null,

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
      d.lastCycleVotesPercentage ??
      null,

    witnessType:
      d.witnessType,

    annualizedRate:
      d.annualizedRate ??
      "0",

    producedTotal:
      d.producedTotal,

    producedEfficiency:
      d.producedEfficiency ??
      null,

    blockReward:
      d.blockReward ??
      null,

    version:
      d.version,

    reward,

    "Claimable Voter/SR Rewards":
      claimableTRX,
  };
}

// ======================================================
// main fetch
// ======================================================

export async function fetchSrSnapshot() {
  try {
    const output = [];

    // ==================================================
    // 1. fetch tracked address
    // ==================================================

    const singleUrl =
      `https://apilist.tronscan.org/api/vote/witness?address=${ADDRESS}`;

    const singleRes: any =
      await axios.get(
        singleUrl,
        {
          timeout: 30000,
        }
      );

    const mainWitness =
      singleRes.data.data;

    if (!mainWitness) {
      throw new Error(
        `No witness data found for tracked address: ${ADDRESS}`
      );
    }

    console.log(
      `Fetched tracked address: ${mainWitness.name}`
    );

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
            start: 0,
          },
          timeout: 30000,
        }
      );

    const srList =
      (srRes.data.data || [])
        .sort(
          (a: any, b: any) =>
            a.ranking - b.ranking
        )
        .slice(0, 27);

    console.log(
      `Fetched top SR count = ${srList.length}`
    );

    // ==================================================
    // 3. append top 27 SR rows
    //    skip tracked address to avoid duplicate snapshot
    // ==================================================

    for (const sr of srList) {
      // 如果 tracked address 以后进入 Top 27，
      // 它已经在上面单独 snapshot 过，这里直接跳过。
      if (sr.address === ADDRESS) {
        console.log(
          `Skipping duplicate tracked address in Top 27: ${sr.name} (${sr.address})`
        );

        continue;
      }

      const row =
        await buildRow(sr);

      output.push(row);
    }

    console.log(
      `Total unique rows = ${output.length}`
    );

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