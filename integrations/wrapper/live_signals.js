const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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
  POLY_AGENT_API_BASE = 'https://gzydspfquuaudqeztorw.supabase.co/functions/v1/agent-api',
  SIGNAL_INTERVAL_MS = 900000, // 15 minutes // 3 minutes
  ORDER_AMOUNT_USD = 20,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const wrapperUrl = WRAPPER_URL || `http://localhost:${PORT}`;

async function fetchMarketDetails(slug) {
  if (!slug) return null;
  try {
    const res = await fetchJson(`${POLY_AGENT_API_BASE}?action=market&slug=${slug}`);
    return res.data || null;
  } catch (err) {
    return null;
  }
}

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

async function getStrategyIds() {
  const { data: strategies, error } = await supabase.from('strategies').select('id,name');
  const { data: agents } = await supabase.from('agents').select('id,name,strategy_id');
  if (error) throw error;
  const { data: settings } = await supabase.from('strategy_settings').select('*');
  const agentMap = {};
  (agents || []).forEach((a) => (agentMap[a.strategy_id] = a.id));
  const settingsMap = {};
  (settings || []).forEach((s) => (settingsMap[s.strategy_id] = s));
  const map = {};
  (strategies || []).forEach((s) => (map[s.name] = s.id));
  return { map, settingsMap, agentMap };
}

async function bondLadderSignal(strategyId, settings, agentId) {
  const markets = await fetchJson(`${POLY_AGENT_API_BASE}?action=markets&limit=25&sort=volume_usd&agent_id=BondLadder-Agent`);
  const certainty = settings.certainty_threshold ?? 0.95;
  const liquidityFloor = (settings.liquidity_floor ?? 0.5) * 1_000_000;
  const candidates = markets.data.filter((m) => (m.yes_price >= certainty || m.no_price >= certainty) && !m.is_resolved && (m.liquidity_usd ?? 0) >= liquidityFloor);
  if (!candidates.length) return;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const side = pick.yes_price >= pick.no_price ? 'YES' : 'NO';
  const price = side === 'YES' ? pick.yes_price : pick.no_price;
  const fairValue = 1.0;
  const baseSize = Number(ORDER_AMOUNT_USD) * (settings.order_size_multiplier ?? 1.0);
  const jitter = 0.6 + Math.random() * 0.8;
  const size = Number((baseSize * jitter).toFixed(2));
  const pnl = size * (fairValue - price);

  await postTrade({
    strategy_id: strategyId,
    market: pick.title,
    side,
    notional: Number(size),
    pnl: Number(pnl.toFixed(2)),
    agent_id: agentId || null,
    market_id: pick.market_id || null,
    market_slug: pick.slug || null,
    closes_at: pick.closes_at || null,
    is_resolved: pick.is_resolved ?? false,
  });

  await postEvent({
    agent_id: agentId || null,
    event_type: 'bond_ladder_signal',
    severity: 'info',
    message: `Signal: ${pick.title} @ ${price} (${side})`,
  });
}

async function aiContrarianSignal(strategyId, settings, agentId) {
  const res = await fetchJson(`${POLY_AGENT_API_BASE}?action=ai-vs-humans&limit=25&agent_id=AIContrarian-Agent`);
  const threshold = settings.divergence_threshold ?? 20;
  const candidates = res.data.filter((m) => Math.abs(m.divergence || 0) >= threshold);
  if (!candidates.length) return;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const side = pick.divergenceDirection === 'bullish' ? 'YES' : 'NO';
  const yesPrice = pick.polymarketPrice;
  const noPrice = 1 - yesPrice;
  const aiConsensus = pick.aiConsensus ?? 0.5;
  const price = side === 'YES' ? yesPrice : noPrice;
  const fairValue = side === 'YES' ? aiConsensus : (1 - aiConsensus);
  const baseSize = Number(ORDER_AMOUNT_USD) * (settings.order_size_multiplier ?? 1.0);
  const jitter = 0.6 + Math.random() * 0.8;
  const size = Number((baseSize * jitter).toFixed(2));
  const pnl = size * (fairValue - price);

  const slug = pick.polymarketEventSlug || pick.slug;
  const details = await fetchMarketDetails(slug);

  await postTrade({
    strategy_id: strategyId,
    market: pick.title,
    side,
    notional: Number(size),
    pnl: Number(pnl.toFixed(2)),
    agent_id: agentId || null,
    market_id: details?.market_id || null,
    market_slug: slug || null,
    closes_at: details?.closes_at || null,
    is_resolved: details?.is_resolved ?? false,
  });

  await postEvent({
    agent_id: agentId || null,
    event_type: 'ai_contrarian_signal',
    severity: 'info',
    message: `Signal: ${pick.title} (AI ${pick.aiConsensus?.toFixed?.(2) ?? pick.aiConsensus} vs market ${pick.polymarketPrice})`,
  });
}

async function run() {
  const { map: ids, settingsMap, agentMap } = await getStrategyIds();
  const bondId = ids['Polymarket Bond Ladder'];
  const aiId = ids['AI Contrarian'];
  if (!bondId || !aiId) {
    console.error('Missing strategy IDs in Supabase.');
    process.exit(1);
  }

  console.log('Live signal runner online.');
  await postEvent({ event_type: 'signal_runner_start', severity: 'info', message: 'Signal runner online (PolymarketScan feed)' });

  setInterval(async () => {
    try {
      await bondLadderSignal(bondId, settingsMap[bondId] || {}, agentMap[bondId]);
      await aiContrarianSignal(aiId, settingsMap[aiId] || {}, agentMap[aiId]);
    } catch (err) {
      console.error('Signal runner error', err?.message || err);
    }
  }, Number(SIGNAL_INTERVAL_MS));
}

run().catch((err) => {
  console.error('Runner failed', err?.message || err);
  process.exit(1);
});
