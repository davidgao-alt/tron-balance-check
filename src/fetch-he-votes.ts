// src/fetch-he-votes.ts

import axios from "axios";

// ======================================================
// watched addresses
// ======================================================

const WATCHED_ADDRESSES = new Set([

  "TUjx6w55Nx9G4GjjRNEB4e7w5BUH3WmJTZ",
  "TGfWKtSDs96TrX1GwH3xsf5HxZhj1PPydv",
  "TPqmGMoidNTbMZ8ApgcbPMf7JDyiHi1sv5",
  "TT7BkPRW4qdGrmDrkVgkZHqtKfHnX6kih9",
  "TMRPTUNer5c3CJqbi1bvvQuQA3f236fAGB",
  "TKRVSSF5LicLNBTwcoyxYxNFXmjDw7uHRu",
  "TS3cmLYjnQYM3rpRRTvCjHqYFx8QYnguan",
  "TQiXPTvHuqaBW94pqrbgwptkSFXsMLrxnM",
  "THZovMcKoZaV9zzFTWteQYd2f3NEvnzxAM",
  "TKgD8Qnx9Zw3DNvG6o83PkufnMbtEXis4T",
  "TSF2rqLdrrZG7PZkDxtvu6B2PTpofidMAX",
  "TZ1SsapyhKNWaVLca6P2qgVzkHTdk6nkXa",
  "TYh6mgoMNZTCsgpYHBz7gttEfrQmDMABub",
  "TM3sTVyahiGWYktKg8G6miHpTzRurKDt7b",
  "TGn1uvntAVntT1pG8o7qoKkbViiYfeg6Gj",
  "TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N",
  "TF2fmSbg5HAD34KPUH7WtWCxxvgXHohzYM",
  "TWadTqi8aCMDdgPTdoiUuQAJgsBLhue7uE",
  "TEF9ZVUxhmGGffvkf59e2vdLfAG1QCMb7B",
  "TCVvHUqZC6uezrxhCgAXqC45XHt35mNJyy",
  "TXomXpYhRcCCoEyki5Vg8Si1vUFaamFX9t",
  "TH7vVF9RTMXM9x7ZnPnbNcEph734hpu8cf",
  "TRSXRWudzfzY4jH7AaMowdMNUXDkHisbcd",
  "TJykPcjCtdYLAJLUgGTUF5gYEcxpbz58Qc",
  "TZ63tkpcJobcvwsamPknL6JvAAwPLzmbNy",
  "TDfaxYr8TJkdqzsch6574caKgUYxGij86H",
  "TGCkX96MA1rmQcQ1BYxAnV34pz2k1v2m16",
  "TH46mnDEM78hFBh26np3hDLjFy7WxFKSVV",
  "TE9VGAC7Qce3Lm7emJK4WoM1xp43wT87qD",
  "TLZXe1w751dcmu2B4t3KhhRca27dJhema4"
]);

// ======================================================
// sleep helper
// ======================================================

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ======================================================
// get top 27 SR
// ======================================================

async function getTopSRs() {

  const res: any = await axios.get(
    "https://apilist.tronscan.org/api/pagewitness",
    {
      params: {
        limit: 50,
        start: 0
      }
    }
  );

  const data = res.data.data || [];

  return data
    .sort(
      (a: any, b: any) =>
        a.ranking - b.ranking
    )
    .slice(0, 27)
    .map((x: any) => ({

      address: x.address,
      name: x.name,
      ranking: x.ranking,
      url: x.url

    }));
}

// ======================================================
// get votes
// ======================================================

async function getVotes(
  srAddress: string
) {

  const res: any = await axios.get(
    "https://apilist.tronscan.org/api/vote",
    {
      params: {
        sort: "",
        limit: 50,
        start: 0,
        candidate: srAddress
      }
    }
  );

  return res.data.data || [];
}

// ======================================================
// main
// ======================================================

export async function fetchHeVotes() {

  const srList =
    await getTopSRs();

  const rows: any[] = [];

  for (const sr of srList) {

    const srAddress =
      sr.address;

    const srName =
      sr.name;

    const srRanking =
      sr.ranking;

    const srUrl =
      sr.url;

    console.log(
      `\nProcessing SR: ${srName}`
    );

    // avoid 429
    await sleep(3000);

    let votes: any[] = [];

    try {

      votes =
        await getVotes(srAddress);

    } catch (e: any) {

      console.log(
        `failed: ${srName}`
      );

      continue;
    }

    console.log(
      `votes fetched: ${votes.length}`
    );

    // filter watched addresses
    const filtered =
      votes.filter(
        (v: any) =>
          WATCHED_ADDRESSES.has(
            v.voterAddress
          )
      );

    if (filtered.length === 0) {

      console.log(
        "No matching addresses"
      );

      continue;
    }

    // he votes
    const heVotes =
      filtered.reduce(
        (sum: number, v: any) =>
          sum + Number(v.votes || 0),
        0
      );

    const candidateTotalVotes =
      Number(
        filtered[0]
          ?.candidateTotalVotes || 0
      );

    const pct =
      candidateTotalVotes > 0
        ? (
            heVotes /
            candidateTotalVotes *
            100
          ).toFixed(2) + "%"
        : "0%";

    // summary row
    rows.push({

      timestampUtc:
        new Date().toISOString(),

      candidateName:
        srName,

      candidateRanking:
        srRanking,

      candidateAddress:
        srAddress,

      candidateUrl:
        srUrl,

      heVotes,

      candidateTotalVotes,

      pct,

      details: filtered.map(
        (v: any) => ({

          timestamp:
            v.timestamp,

          voterAddress:
            v.voterAddress,

          candidateAddress:
            v.candidateAddress,

          votes:
            v.votes,

          candidateUrl:
            v.candidateUrl,

          candidateName:
            v.candidateName,

          candidateTotalVotes:
            v.candidateTotalVotes

        })
      )

    });
  }

  return rows;
}
