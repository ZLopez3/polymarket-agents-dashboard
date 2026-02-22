-- Add paper portfolio tracking columns to strategies table
ALTER TABLE strategies
  ADD COLUMN IF NOT EXISTS paper_cash numeric DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS paper_pnl numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_positions integer DEFAULT 0;

-- Seed paper_cash from existing paper_capital or capital_allocation
UPDATE strategies
  SET paper_cash = COALESCE(capital_allocation, paper_capital, 1000)
  WHERE paper_cash IS NULL OR paper_cash = 1000;
