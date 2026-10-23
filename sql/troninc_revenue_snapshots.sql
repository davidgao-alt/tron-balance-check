-- Tron Inc. revenue wallet snapshots (TEb4gXicQ39VWN3jbeXygEJJV1McRWg4uZ).
-- Written by src/insert-troninc-revenue.ts, shown on src/public/troninc-revenue.html.
-- Database: tron_sr_db. Run once: psql "$DATABASE_URL" -f sql/troninc_revenue_snapshots.sql

CREATE TABLE IF NOT EXISTS troninc_revenue_snapshots (
  id                    BIGSERIAL PRIMARY KEY,
  snapshot_time_utc     TIMESTAMPTZ   NOT NULL,
  snapshot_time_hkt     TIMESTAMP     NOT NULL,             -- Hong Kong wall-clock time
  address               TEXT          NOT NULL,

  -- TRX amounts (TronGrid, Stake 2.0)
  trx_available         NUMERIC(38,6) NOT NULL,             -- liquid balance
  trx_staked            NUMERIC(38,6) NOT NULL,             -- all staked TRX, incl. delegated to others
  trx_staked_energy     NUMERIC(38,6) NOT NULL,
  trx_staked_bandwidth  NUMERIC(38,6) NOT NULL,
  trx_delegated_out     NUMERIC(38,6) NOT NULL,             -- part of trx_staked delegated to other accounts
  trx_unstaking         NUMERIC(38,6) NOT NULL,             -- unstaked, still in the waiting period
  trx_withdrawable      NUMERIC(38,6) NOT NULL,             -- waiting period over, not withdrawn yet
  trx_total             NUMERIC(38,6) NOT NULL,             -- available + staked + unstaking + withdrawable

  -- resources
  energy_limit          BIGINT        NOT NULL,
  energy_used           BIGINT        NOT NULL,
  energy_available      BIGINT        NOT NULL,
  bandwidth_limit       BIGINT        NOT NULL,             -- free + staked bandwidth
  bandwidth_used        BIGINT        NOT NULL,
  bandwidth_available   BIGINT        NOT NULL,

  -- votes
  vote_power            BIGINT        NOT NULL,             -- TRON Power (votes it can cast)
  votes_used            BIGINT        NOT NULL,             -- votes cast
  votes                 JSONB         NOT NULL,             -- [{sr_address, sr_name, votes}]

  -- rewards and tokens
  claimable_reward_trx  NUMERIC(38,6) NOT NULL,             -- claimable voter/SR rewards
  strx_balance          NUMERIC(38,18) NOT NULL,            -- sTRX (TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5)

  -- assets list and prices (Tronscan); NULL when Tronscan was unavailable
  trx_price_usd         NUMERIC(38,12),
  total_assets_usd      NUMERIC(38,6),                      -- trx_total * trx_price_usd + other tokens in USD
  assets                JSONB,                              -- [{token_id, token_name, token_abbr, token_type, balance, price_usd, value_usd}]

  raw_json              JSONB         NOT NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS troninc_revenue_snapshots_time_idx
  ON troninc_revenue_snapshots (snapshot_time_utc DESC);
