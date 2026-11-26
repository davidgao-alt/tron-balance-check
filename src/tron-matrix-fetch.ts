import { TronWeb } from "tronweb";
import { fetchWalletFromAccount, tronGridPost, tronscanGet } from "./troninc-revenue-fetch";

export const MATRIX_ADDRESS = "TAQpHTD8ick22uvMVLSPvsTZzK4CqCYkwQ";

export async function fetchMatrixSnapshot() {
  const address = MATRIX_ADDRESS;
  const now = new Date();
  const base = {
    address,
    name: "Tron Matrix",
    witnessDetailUnavailable: false,
    timestampUTC: now.toISOString(),
    // Match the HKT wall-clock convention used by historical SR rows.
    timestampHKT: now.toLocaleString("sv-SE", { timeZone: "Asia/Hong_Kong" }).replace(" ", "T"),
  };
  const account = await tronGridPost("/wallet/getaccount", { address });
  if (!Object.keys(account).length) {
    return { ...base, accountStatus: "Unactivated" };
  }
  const walletSnapshot = await fetchWalletFromAccount(address, account, now);
  const { witnesses } = await tronGridPost("/wallet/listwitnesses", {});
  if (!Array.isArray(witnesses) || !witnesses.some(w => w?.isJobs === true) ||
      witnesses.some(w => !TronWeb.isAddress(w?.address))) {
    throw new Error("Invalid TronGrid witness list");
  }
  // listwitnesses can return hex even when the request sets visible: true.
  const matrixHex = TronWeb.address.toHex(address);
  const witness = witnesses.find(w => TronWeb.address.toHex(w.address) === matrixHex);
  if (!witness && account.is_witness) throw new Error("Witness registration pending confirmation");
  const wallet = {
    ...base,
    walletSnapshot,
    reward: walletSnapshot.rawJson.trongrid.reward.reward ?? 0,
    "Claimable Voter/SR Rewards": walletSnapshot.claimableRewardTrx,
    trxBalance: walletSnapshot.trxAvailable,
  };
  if (!witness) return { ...wallet, accountStatus: "Activated" };

  // Registration on-chain can precede indexing on TronScan. Keep the confirmed
  // wallet and chain status even if the optional witness details are unavailable.
  let detail;
  let witnessDetailUnavailable = false;
  try {
    const info = await tronscanGet("/api/vote/witness", { address });
    if (!info || !("data" in info) || (info.code != null && Number(info.code) !== 200) ||
        info.success === false || info.success === "false" ||
        (info.data !== null && info.data?.address !== address)) {
      throw new Error("Invalid TronScan witness details");
    }
    detail = info.data;
  } catch (err) {
    console.warn("Matrix witness details unavailable:", err instanceof Error ? err.message : "request failed");
    witnessDetailUnavailable = true;
  }

  return {
    ...detail,
    ...wallet,
    witnessDetailUnavailable,
    accountStatus: witness.isJobs === true ? "SR" : "Candidate",
    lastRanking: detail?.lastRanking ?? detail?.ranking,
    realTimeRanking: detail?.realTimeRanking ?? detail?.ranking,
    producedTotal: detail?.producedTotal ?? witness.totalProduced,
  };
}
