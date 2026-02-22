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

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PORT = 3090,
  WRAPPER_URL,
  COPY_INTERVAL_MS = 120000,
} = process.env;

const BASE = 'https://gzydspfquuaudqeztorw.supabase.co/functions/v1/agent-api';

// Permanent wallets -- always included regardless of Fin recommendations
const SEED_WALLETS = new Set([
  '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee',
  '0x63ce342161250d705dc0b16df89036c8e5f9ba9a',
  '0xdfe3fedc5c7679be42c3d393e99d4b55247b73c4',
  '0xd1ecfa3e7d221851663f739626dcd15fca565d8e',
  '0x5739ddf8672627ce076eff5f444610a250075f1a',
  '0x7f3c8979d0afa00007bae4747d5347122af05613',
  '0x4dfd481c16d9995b809780fd8a9808e8689f6e4a',
  '0xe52c0a1327a12edc7bd54ea6f37ce00a4ca96924',
  '0x0b219cf3d297991b58361dbebdbaa91e56b8deb6',
  '0x85d575c99b977e9e39543747c859c83b727aaece',
  '0xf5fe759cece500f58a431ef8dacea321f6e3e23d',
  '0x9c667a1d1c1337c6dca9d93241d386e4ed346b66',
].map((w) => w.toLowerCase()));

async function buildWatchlist() {
  try {
    const now = new Date().toISOString();
    const url = `${SUPABASE_URL}/rest/v1/fin_recommendations?select=payload&recommendation_type=eq.wallet&expires_at=gte.${encodeURIComponent(now)}&order=created_at.desc&limit=20`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    const data = await res.json();
    const finWallets = (data || [])
      .map((r) => r.payload?.address?.toLowerCase())
      .filter(Boolean);
    const combined = new Set([...SEED_WALLETS, ...finWallets]);
    console.log(`[copy-trader] Watchlist: ${combined.size} wallets (${SEED_WALLETS.size} seed + ${finWallets.length} Fin-recommended)`);
    return combined;
  } catch (err) {
    console.error('[copy-trader] Failed to fetch Fin wallets, using seed only:', err.message);
    return new Set([...SEED_WALLETS]);
  }
}

const MAX_RESOLUTION_WINDOW_MS = 21 * 24 * 60 * 60 * 1000; // 21 days

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const wrapperUrl = WRAPPER_URL || `http://localhost:${PORT}`;
let lastSeen = new Set();

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postEvent(payload) {
  const res = await fetch(`${wrapperUrl}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('Event failed', txt);
  }
}

async function postTrade(payload) {
  const res = await fetch(`${wrapperUrl}/trade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('Trade failed', txt);
  }
}

async function getStrategyId() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/strategies?select=id,name&name=eq.${encodeURIComponent('Copy Trader - Whale Mirror')}`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const data = await res.json();
  return data?.[0]?.id;
}

function sizeFromTier(tier) {
  if (tier === 'mega') return 30;
  if (tier === 'large') return 20;
  if (tier === 'medium') return 15;
  return 10;
}

async function runOnce() {
  const strategyId = await getStrategyId();
  if (!strategyId) return;

  const WATCH_WALLETS = await buildWatchlist();

  const feed = await fetchJson(`${BASE}?action=whales&limit=200`);
  const rows = feed.data || [];

  console.log(`[copy-trader] Fetched ${rows.length} whale rows, watching ${WATCH_WALLETS.size} wallets`);

  let matchedWallet = 0;

  for (const w of rows) {
    const wallet = (w.wallet || '').toLowerCase();
    if (!WATCH_WALLETS.has(wallet)) continue;
    matchedWallet++;

    if (!w.closes_at) continue;
    const closesAt = new Date(w.closes_at);
    if (Number.isNaN(closesAt.getTime())) continue;
    if (closesAt.getTime() - Date.now() > MAX_RESOLUTION_WINDOW_MS) continue;

    const key = `${w.tx_hash || ''}-${w.market_id || ''}`;
    if (lastSeen.has(key)) continue;
    lastSeen.add(key);

    const notional = sizeFromTier(w.tier);
    const side = (w.outcome || '').toLowerCase().includes('no') ? 'NO' : 'YES';

    await postTrade({
      strategy_id: strategyId,
      market: w.market_title,
      side,
      notional,
      pnl: 0,
      market_id: w.market_id || null,
      market_slug: w.market_slug || null,
      closes_at: w.closes_at || null,
      is_resolved: w.is_resolved ?? false,
    });

    await postEvent({
      agent_id: null,
      event_type: 'copy_trade_signal',
      severity: 'info',
      message: `Copy-trade: ${wallet.slice(0,6)}… ${side} ${w.market_title} @ ${w.price} (tier: ${w.tier})`,
    });
  }
}

async function main() {
  await postEvent({ event_type: 'copy_trader_online', severity: 'info', message: 'Copy trader watcher online (all categories)' });
  await runOnce();
  setInterval(async () => {
    try {
      await runOnce();
    } catch (err) {
      console.error('copy trader error', err?.message || err);
    }
  }, Number(COPY_INTERVAL_MS));
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
