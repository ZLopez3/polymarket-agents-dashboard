const fs = require('fs');
const path = require('path');
const express = require('express');
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
  RISK_CONFIG_PATH,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();
app.use(express.json());

const riskConfigPath = RISK_CONFIG_PATH || path.join(__dirname, 'risk.json');
let riskConfig = {
  defaults: {
    max_trade_notional: 200,
    max_trades_per_hour: 30,
    max_daily_notional: 2000,
    max_daily_loss: -100,
  },
  strategies: {},
};

if (fs.existsSync(riskConfigPath)) {
  try {
    const raw = fs.readFileSync(riskConfigPath, 'utf-8');
    const parsed = JSON.parse(raw);
    riskConfig = { ...riskConfig, ...parsed };
  } catch (err) {
    console.error('Failed to parse risk.json, using defaults.', err?.message || err);
  }
}

const getLimits = (strategyId) => {
  const defaults = riskConfig.defaults || {};
  const overrides = (riskConfig.strategies || {})[strategyId] || {};
  return { ...defaults, ...overrides };
};

async function logRiskBlock(agentId, reason) {
  try {
    await supabase.from('events').insert({
      agent_id: agentId || null,
      event_type: 'risk_block',
      severity: 'warning',
      message: reason,
    });
  } catch (err) {
    console.error('Failed to log risk block', err?.message || err);
  }
}

async function checkRisk(strategyId, agentId, notional, pnl = 0) {
  const limits = getLimits(strategyId);
  const now = Date.now();
  const dayIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const hourIso = new Date(now - 60 * 60 * 1000).toISOString();

  const { data: dayTrades, error } = await supabase
    .from('trades')
    .select('notional,pnl,executed_at')
    .eq('strategy_id', strategyId)
    .gte('executed_at', dayIso);

  if (error) {
    return { ok: false, reason: `risk_check_failed: ${error.message}` };
  }

  let dayNotional = 0;
  let dayPnl = 0;
  let hourCount = 0;

  for (const t of dayTrades || []) {
    dayNotional += Number(t.notional) || 0;
    dayPnl += Number(t.pnl) || 0;
    if (t.executed_at >= hourIso) hourCount += 1;
  }

  if (Number(notional) > limits.max_trade_notional) {
    return { ok: false, reason: `max_trade_notional exceeded (${notional} > ${limits.max_trade_notional})` };
  }

  if (dayNotional + Number(notional) > limits.max_daily_notional) {
    return { ok: false, reason: `max_daily_notional exceeded (${dayNotional + Number(notional)} > ${limits.max_daily_notional})` };
  }

  if (hourCount >= limits.max_trades_per_hour) {
    return { ok: false, reason: `max_trades_per_hour exceeded (${hourCount} >= ${limits.max_trades_per_hour})` };
  }

  if (dayPnl + Number(pnl) < limits.max_daily_loss) {
    return { ok: false, reason: `max_daily_loss exceeded (${dayPnl + Number(pnl)} < ${limits.max_daily_loss})` };
  }

  return { ok: true };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/heartbeat', async (req, res) => {
  const { agent_id, status = 'ok', detail = '' } = req.body || {};
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' });

  const { error } = await supabase.from('agent_heartbeats').insert({
    agent_id,
    status,
    detail,
  });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.post('/event', async (req, res) => {
  const { agent_id, event_type, severity = 'info', message = '' } = req.body || {};
  if (!event_type) {
    return res.status(400).json({ error: 'event_type required' });
  }

  const { error } = await supabase.from('events').insert({
    agent_id: agent_id || null,
    event_type,
    severity,
    message,
  });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.post('/trade', async (req, res) => {
  const {
    strategy_id,
    agent_id,
    market,
    side,
    notional,
    pnl = 0,
    market_id = null,
    market_slug = null,
    closes_at = null,
    is_resolved = false,
  } = req.body || {};

  if (!strategy_id || !market || !side || typeof notional === 'undefined') {
    return res.status(400).json({ error: 'strategy_id, market, side, notional required' });
  }

  const risk = await checkRisk(strategy_id, agent_id, notional, pnl);
  if (!risk.ok) {
    await logRiskBlock(agent_id, risk.reason);
    return res.status(400).json({ error: risk.reason });
  }

  const { error } = await supabase.from('trades').insert({
    strategy_id,
    agent_id,
    market,
    side,
    notional,
    pnl,
    market_id,
    market_slug,
    closes_at,
    is_resolved,
  });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Execution wrapper listening on :${PORT}`);
});
