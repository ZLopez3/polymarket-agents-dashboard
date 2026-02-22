const fs = require('fs');
const path = require('path');

const envCandidates = [
  process.env.WRAPPER_ENV_PATH,
  path.join(__dirname, 'env.txt'),
  path.join(__dirname, '.env'),
].filter(Boolean);

envCandidates.forEach((envPath) => {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }
});

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const POLY_AGENT_API_BASE = 'https://gzydspfquuaudqeztorw.supabase.co/functions/v1/agent-api';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function updateTrade(tradeId, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${tradeId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('Failed to update trade', tradeId, txt);
  }
}

async function run() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?select=id,market,market_slug,is_resolved,closes_at&is_resolved=eq.false&limit=50`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const trades = await res.json();

  for (const t of trades || []) {
    const slug = t.market_slug;
    if (!slug) continue;
    try {
      const details = await fetchJson(`${POLY_AGENT_API_BASE}?action=market&slug=${encodeURIComponent(slug)}`);
      const data = details.data || {};
      await updateTrade(t.id, {
        closes_at: data.closes_at || t.closes_at,
        is_resolved: data.is_resolved ?? t.is_resolved,
      });
    } catch (err) {
      console.error('Resolve refresh failed', err?.message || err);
    }
  }
}

run().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
