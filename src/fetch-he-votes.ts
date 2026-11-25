// src/fetch-he-votes.ts

import axios from "axios";
import { TronWeb } from "tronweb";

// ======================================================
// watched addresses
// ======================================================

export function readWatchedAddresses(raw = process.env.HE_WATCHED_ADDRESSES): Set<string> {
  const addresses = (raw ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!addresses.length || addresses.some(address => !address.startsWith("T") || !TronWeb.isAddress(address))) {
    throw new Error("HE_WATCHED_ADDRESSES must contain valid TRON addresses, one per line");
  }
  return new Set(addresses);
}

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
  const watchedAddresses = readWatchedAddresses();

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
          watchedAddresses.has(
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
