import axios from "axios";
import TronWeb from "tronweb";

const ADDRESS = "TCEo1hMAdaJrQmvnGTCcGT2LqrGU4N7Jqf";

type TronscanResponse = {
  data: {
    lastRanking: number;
    realTimeRanking: number;
    address: string;
    name: string;
    lastCycleVotes: number;
    realTimeVotes: number;
    changeVotes: number;
    brokerage: number;
    voterBrokerage: number;
    votesPercentage: number;
    lastCycleVotesPercentage: number;
    witnessType: number;
    annualizedRate: string;
    producedTotal: number;
    producedEfficiency: number;
    blockReward: number;
    version: number;
  };
};

const tronWeb = new TronWeb.TronWeb({
  fullHost: "https://api.trongrid.io",
});

export async function fetchSrSnapshot() {
  const url = `https://apilist.tronscan.org/api/vote/witness?address=${ADDRESS}`;

  try {
    const res = await axios.get<TronscanResponse>(url);
    const d = res.data.data;

    const reward = await tronWeb.trx.getReward(ADDRESS);
    const claimableTRX = reward / 1e6;

    const timestampUTC = new Date().toISOString();
    const timestampHKT = new Date()
      .toLocaleString("sv-SE", { timeZone: "Asia/Hong_Kong" })
      .replace(" ", "T");

    return {
      timestampUTC,
      timestampHKT,
      lastRanking: d.lastRanking,
      realTimeRanking: d.realTimeRanking,
      address: d.address,
      name: d.name,
      lastCycleVotes: d.lastCycleVotes,
      realTimeVotes: d.realTimeVotes,
      changeVotes: d.changeVotes,
      brokerage: d.brokerage,
      voterBrokerage: d.voterBrokerage,
      votesPercentage: d.votesPercentage,
      lastCycleVotesPercentage: d.lastCycleVotesPercentage,
      witnessType: d.witnessType,
      annualizedRate: d.annualizedRate,
      producedTotal: d.producedTotal,
      producedEfficiency: d.producedEfficiency,
      blockReward: d.blockReward,
      version: d.version,
      reward,
      "Claimable Voter/SR Rewards": claimableTRX
    };

  } catch (err) {
    console.error("fetch error:", err);
    throw err;
  }
}

if (require.main === module) {
  fetchSrSnapshot()
    .then((out) => console.log(JSON.stringify(out, null, 2)))
    .catch(console.error);
}