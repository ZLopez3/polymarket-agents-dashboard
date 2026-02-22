-- Add status and error columns to trades table
-- status: 'filled' (default), 'failed', 'rejected', 'pending'
-- error: error message string when status is 'failed'
ALTER TABLE trades ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'filled';
ALTER TABLE trades ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS trading_mode text NOT NULL DEFAULT 'paper';
