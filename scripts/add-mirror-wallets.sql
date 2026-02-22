-- Add mirror_wallets column to strategies table
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS mirror_wallets text[] DEFAULT '{}';

-- Seed a dedicated strategy for KrackenSruster
INSERT INTO strategies (name, owner, agent_id, trading_mode, paper_capital, paper_cash, capital_allocation, mirror_wallets)
SELECT
  'Whale Mirror - KrackenSruster',
  'Cot',
  a.id,
  'paper',
  100, 100, 100,
  ARRAY['0xd44e974a3edb232aa4aedbdcc59792b76a5f67e2']
FROM agents a WHERE a.name = 'Cot' LIMIT 1
ON CONFLICT DO NOTHING;
