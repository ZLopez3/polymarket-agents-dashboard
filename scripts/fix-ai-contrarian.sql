-- Fix AI Contrarian: Delete unused "Core" strategy, wire original to AIContrarian-Agent
-- The "AI Contrarian - Core" (db6fb93d-...) has 0 trades, only $10 cash.
-- The original "AI Contrarian" (f0c9d014-...) has 248 trades, +$1K PnL but is orphaned (no agent_id).

-- Step 1: Delete strategy_settings for the unused Core strategy
DELETE FROM strategy_settings
WHERE strategy_id = 'db6fb93d-517e-49b6-9d51-fffa80d4f9e1';

-- Step 2: Delete trade_logs for the unused Core strategy (just 1 row)
DELETE FROM trade_logs
WHERE strategy_id = 'db6fb93d-517e-49b6-9d51-fffa80d4f9e1';

-- Step 3: Delete the unused Core strategy itself
DELETE FROM strategies
WHERE id = 'db6fb93d-517e-49b6-9d51-fffa80d4f9e1';

-- Step 4: Wire the original AI Contrarian strategy to its agent
UPDATE strategies
SET agent_id = '1236291b-82fc-4383-84af-c7187a20d187'
WHERE id = 'f0c9d014-9745-4b1c-bb20-0e7538ff4b8e';
