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
  AUDIT_INTERVAL_MS = 4 * 60 * 60 * 1000, // 4 hours
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function logEvent(message) {
  await supabase.from('events').insert({
    agent_id: null,
    event_type: 'auditor',
    severity: 'info',
    message,
  });
}

function computeDrawdown(trades, base = 100) {
  let equity = base;
  let peak = base;
  for (const t of trades) {
    equity += Number(t.pnl) || 0;
    if (equity > peak) peak = equity;
  }
  const dd = peak > 0 ? (peak - equity) / peak : 0;
  return { equity, peak, dd };
}

async function getTrades(strategyId) {
  const { data, error } = await supabase
    .from('trades')
    .select('pnl,executed_at')
    .eq('strategy_id', strategyId)
    .order('executed_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function runAudit() {
  const { data: strategies } = await supabase.from('strategies').select('*');
  const { data: settings } = await supabase.from('strategy_settings').select('*');
  const settingsMap = Object.fromEntries((settings || []).map((s) => [s.strategy_id, s]));

  for (const s of strategies || []) {
    const trades = await getTrades(s.id);
    if (!trades.length) continue;

    const base = Number(s.paper_capital ?? 100);
    const { dd } = computeDrawdown(trades, base);

    if (dd < 0.15) continue; // only act beyond 15%

    const current = settingsMap[s.id] || {};
    const updates = { strategy_id: s.id };

    if (s.name.toLowerCase().includes('contrarian')) {
      updates.divergence_threshold = Math.min(50, (current.divergence_threshold ?? 20) + 2);
      updates.order_size_multiplier = Math.max(0.5, (current.order_size_multiplier ?? 1.0) * 0.9);
    } else {
      updates.certainty_threshold = Math.min(0.99, (current.certainty_threshold ?? 0.95) + 0.01);
      updates.liquidity_floor = Math.min(0.9, (current.liquidity_floor ?? 0.5) + 0.05);
      updates.order_size_multiplier = Math.max(0.5, (current.order_size_multiplier ?? 1.0) * 0.9);
    }

    updates.last_tuned_at = new Date().toISOString();

    await supabase.from('strategy_settings').upsert(updates);
    await logEvent(`Audi tuning applied for ${s.name} (drawdown ${(dd*100).toFixed(1)}%)`);
  }
}

async function main() {
  await logEvent('Audi auditor online (4h cadence)');
  await runAudit();
  setInterval(runAudit, Number(AUDIT_INTERVAL_MS));
}

main().catch((err) => {
  console.error('Audi failed', err?.message || err);
  process.exit(1);
});
