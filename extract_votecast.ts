import TronWeb from "tronweb";
import fs from "fs";

// 输入文件路径
const INPUT_FILE = "first200_events.json";
const OUTPUT_FILE = "votecast_extracted.csv";

const tronWeb = new (TronWeb as any).TronWeb({
  fullHost: "https://api.trongrid.io",
});

const data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

const voteEvents = data.filter((e: any) => e.event_name === "VoteCast");

const rows = [["transaction_id", "voter_hex", "voter_tron", "proposalId", "votes_raw", "votes_human"]];

for (const e of voteEvents) {
  const txId = e.transaction_id || "";
  const voterHex = e.result?.voter || "";
  let voterTron = "";
  try {
    if (voterHex.startsWith("0x")) {
      voterTron = tronWeb.address.fromHex(voterHex);
    }
  } catch {
    voterTron = "";
  }

  const proposalId = e.result?.proposalId || "";
  const votesRaw = e.result?.votes || "";

  let votesHuman = "";
  if (votesRaw) {
    try {
      votesHuman = (Number(votesRaw) / 1e18).toFixed(6);
    } catch {
      votesHuman = "";
    }
  }

  rows.push([txId, voterHex, voterTron, proposalId, votesRaw, votesHuman]);
}

const csv = rows.map((r) => r.join(",")).join("\n");
fs.writeFileSync(OUTPUT_FILE, csv);


