---
title: "TRON Snapshot Dashboards"
author: "davidgao-alt/tron-balance-check"
date: "2026-11-26"
lang: en-US
---

# TRON wallets and SRs

| Page | Snapshot data |
| :--- | :--- |
| [Tron Matrix](https://tronscan-sr-metrics.onrender.com/tron-matrix.html#overview) · [SQL history](https://tronscan-sr-metrics.onrender.com/tron-matrix.html#sql) | Account status, TRX balances and staking. SR rank and votes appear once witness data is available. |
| [SR Metrics](https://tronscan-sr-metrics.onrender.com/sr.html) | Votes, vote share, brokerage and claimable TRX rewards by Super Representative. |
| [Tron Inc. Revenue Wallet](https://tronscan-sr-metrics.onrender.com/troninc-revenue.html) | Available and staked TRX, sTRX, rewards, energy and bandwidth. |

All three update every two hours and use Hong Kong time for date filters. Tron Matrix and SR Metrics share the `sr_snapshots` table.

# sTRX activity and wallet history

[Open the sTRX query page](https://troninc-wallet-event-query.onrender.com/query.html)

- **On-chain sTRX Activity** shows the last five deposits or withdrawals before 00:00 UTC on the selected date.
- **Wallet Snapshots (SQL / CSV)** lets you query hourly wallet valuations from `wallet-snapshot-cron` and export the results as CSV.

# Treasury and token supply

- [MSTR & SharpLink](https://mstr-sharplink-snapshot.onrender.com/mstr-sharplink-view.html) shows hourly share prices, Strategy’s BTC holdings and SharpLink’s ETH holdings. **Refresh** writes a new snapshot. Use **Run** to query existing ones.
- **Kelp rsETH** supply history is available by chain. Collection is paused. [rsETH history](https://tronscan-sr-metrics.onrender.com/kelp-rseth.html)
- **USDT** circulating and total supply come from CoinMarketCap. The daily job writes to `cmc_usdt_supply_snapshots`. [Collector](src/insert-cmc-usdt.ts)
