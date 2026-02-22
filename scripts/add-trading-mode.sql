-- Add trading mode columns to strategies
ALTER TABLE strategies
  ADD COLUMN IF NOT EXISTS trading_mode text NOT NULL DEFAULT 'paper',
  ADD COLUMN IF NOT EXISTS max_position_size numeric NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_orders_per_minute integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS daily_loss_limit numeric NOT NULL DEFAULT -200,
  ADD COLUMN IF NOT EXISTS capital_allocation numeric NOT NULL DEFAULT 1000;

-- Create trade_logs table for structured execution logging
CREATE TABLE IF NOT EXISTS trade_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid REFERENCES strategies(id) ON DELETE CASCADE,
  event text NOT NULL,
  mode text NOT NULL DEFAULT 'paper',
  market_id text,
  order_details jsonb,
  result text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_logs_strategy ON trade_logs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_trade_logs_created ON trade_logs(created_at DESC);
