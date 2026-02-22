ALTER TABLE strategy_settings
ADD COLUMN IF NOT EXISTS max_resolution_days integer DEFAULT 0;

COMMENT ON COLUMN strategy_settings.max_resolution_days IS 'Max days until market resolution. 0 = no filter.';
