-- Create fin_recommendations table: central bus for Fin → execution agent communication
CREATE TABLE IF NOT EXISTS fin_recommendations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  recommendation_type text NOT NULL,          -- 'wallet', 'hot_bet', 'tuning'
  payload jsonb NOT NULL,
  consumed_by text[] DEFAULT '{}',            -- tracks which strategies consumed this
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Index for efficient type + recency lookups
CREATE INDEX IF NOT EXISTS idx_fin_rec_type_created
  ON fin_recommendations(recommendation_type, created_at DESC);

-- Index for expiry-based filtering
CREATE INDEX IF NOT EXISTS idx_fin_rec_expires
  ON fin_recommendations(expires_at)
  WHERE expires_at IS NOT NULL;
