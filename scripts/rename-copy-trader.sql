-- Rename Copy Trader strategy to remove "Crypto" since we're opening it to all categories
UPDATE strategies
SET name = 'Copy Trader - Whale Mirror'
WHERE name = 'Copy Trader - Whale Mirror (Crypto)';
