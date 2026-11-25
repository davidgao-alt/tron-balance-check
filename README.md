---
title: "TRON Snapshot Dashboards"
author: "davidgao-alt/tron-balance-check"
date: "2026-11-26"
lang: en-US
---

This repository collects TRON wallet and Super Representative (SR) snapshots, tracks MSTR and SharpLink treasury valuations, and records token supply. The dashboards below show the latest observations and provide access to historical data.

# TRON SR dashboard

| View | What you can check | Open |
| :--- | :--- | :--- |
| Tron Matrix | Account status, SR rank and votes, TRX balances, and staking. Use SQL for date-filtered history and CSV export. | [Overview](https://tronscan-sr-metrics.onrender.com/tron-matrix.html#overview) · [SQL history](https://tronscan-sr-metrics.onrender.com/tron-matrix.html#sql) |
| SR Metrics | Compare votes, vote share, brokerage, and claimable TRX rewards across representatives. | [SR Metrics](https://tronscan-sr-metrics.onrender.com/sr.html) |
| HE Vote Snapshot | See each candidate’s rank, HE votes, total votes, and the percentage contributed by HE. | [HE Vote Snapshot](https://tronscan-sr-metrics.onrender.com/sr.html#he) |
| Tron Inc. Revenue Wallet | Review available and staked TRX, sTRX, claimable rewards, energy, and bandwidth alongside the latest assets and wallet history. | [Revenue Wallet](https://tronscan-sr-metrics.onrender.com/troninc-revenue.html) |

Tron Matrix shares the two-hour SR collection job and the existing `sr_snapshots` table. Wallet metrics appear after activation. Candidate and SR metrics appear as witness data becomes available.

The revenue wallet also updates every two hours. HE vote snapshots run every six hours. Date filters use Hong Kong time (HKT, UTC+8) for SR Metrics, Revenue Wallet, and Tron Matrix, and UTC for HE votes.

# sTRX activity and wallet history

Use the two tabs on the English dashboard to look up on-chain events or read saved wallet snapshots. The separate `wallet-snapshot-cron` job writes a new snapshot every hour. [Open TRON sTRX Tools](https://troninc-wallet-event-query.onrender.com/query.html)

| Tab | What you can check |
| :--- | :--- |
| On-chain sTRX Activity | Find the last five deposit or withdrawal events before 00:00 UTC on a chosen date. The lookback is adjustable. |
| Wallet Snapshots (SQL / CSV) | Query hourly wallet valuations and export the result as CSV. |

# Treasury valuations and token supply

| Dataset | What you can check | Open |
| :--- | :--- | :--- |
| MSTR & SharpLink | Hourly snapshots of Strategy’s BTC treasury and SharpLink’s ETH treasury, with share prices and historical SQL queries. | [Treasury dashboard](https://mstr-sharplink-snapshot.onrender.com/mstr-sharplink-view.html) |
| Kelp rsETH | Historical supply by chain. The scheduled collector is paused. Saved snapshots are available through SQL and CSV. | [rsETH supply history](https://tronscan-sr-metrics.onrender.com/kelp-rseth.html) |
| USDT | The daily CoinMarketCap collector stores circulating and total supply in `cmc_usdt_supply_snapshots`. | [Collector source](src/insert-cmc-usdt.ts) |

On the treasury dashboard, **Refresh (insert + fetch)** fetches fresh data and writes new snapshots. Use **Run** under either historical query to read saved snapshots.
