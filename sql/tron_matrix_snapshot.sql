-- Apply to tron_sr_db before deploying the SR cron and dashboard.
ALTER TABLE public.sr_snapshots
  ADD COLUMN IF NOT EXISTS account_status text,
  ADD COLUMN IF NOT EXISTS wallet_snapshot jsonb;

-- Execute outside a transaction so existing snapshots can continue to be written.
CREATE INDEX CONCURRENTLY IF NOT EXISTS sr_account_history_idx
  ON public.sr_snapshots (address, timestamputc DESC, id DESC)
  WHERE account_status IS NOT NULL;
