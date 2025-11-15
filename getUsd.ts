import axios from "axios";

async function main() {
  const address = "TEySEZLJf6rs2mCujGpDEsgoMVWKLAk9mT";

  const url = "https://apilist.tronscan.org/api/account/tokens/v2";

  const params = {
    address,
    start: 0,
    limit: 20,
    hidden: 1,
    show: 3,
    showAvailable: 0,
    sortType: 0,
    sortBy: 2,
    assetType: 1,
    card: 0,
  };

  const headers = {
    accept: "application/json, text/plain, */*",
    origin: "https://tronscan.org",
    referer: "https://tronscan.org/",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    secret:
      "NDE3YTg1YmU4MDBjMThmY2IxNTYzOGU4MDRjNTJlZjUzOWQ0MTkyNWUxMDI0ZDViMjRkZGMwYWE1MmE3NjA4Nw==",
    t: "1763051673361",
  };

  const res = await axios.get(url, { params, headers });

  console.log(JSON.stringify(res.data, null, 2));
}

main();