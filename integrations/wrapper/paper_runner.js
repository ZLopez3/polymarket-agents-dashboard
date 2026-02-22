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
  PAPER_INTERVAL_MS = 120000,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const wrapperUrl = WRAPPER_URL || `http://localhost:${PORT}`;

const bondMarkets = ['Fed Cut June', 'US CPI MoM', 'BTC-60k', 'ETH-4k'];
const contrarianMarkets = ['US Election 2028', 'Fed Pause', 'BTC-Down', 'Tech Layoffs'];

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randNotional(min = 50, max = 400) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randPnl() {
  return Math.round(((Math.random() - 0.45) * 10) * 100) / 100; // small bias to positive
}

async function getStrategies() {
  const { data, error } = await supabase.from('strategies').select('id,name,trading_mode');
  if (error) throw error;
  // Only return strategies in paper mode -- live strategies are handled by live_signals.js / cron
  return (data || []).filter((s) => (s.trading_mode || 'paper') === 'paper');
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

async function run() {
  const strategies = await getStrategies();
  if (!strategies.length) {
    console.error('No strategies found for paper runner.');
    process.exit(1);
  }

  console.log(`Paper runner online for ${strategies.length} strategies.`);

  // Initial event
  await postEvent({
    agent_id: null,
    event_type: 'paper_runner_start',
    severity: 'info',
    message: 'Paper trading runner online (synthetic until live feed connected)'
  });

  setInterval(async () => {
    try {
      for (const s of strategies) {
        const isBond = s.name.toLowerCase().includes('bond');
        const market = isBond ? rand(bondMarkets) : rand(contrarianMarkets);
        const side = Math.random() > 0.5 ? 'YES' : 'NO';
        await postTrade({
          strategy_id: s.id,
          market,
          side,
          notional: randNotional(),
          pnl: randPnl(),
        });
      }
    } catch (err) {
      console.error('Paper runner error', err?.message || err);
    }
  }, Number(PAPER_INTERVAL_MS));
}

run().catch((err) => {
  console.error('Paper runner failed', err?.message || err);
  process.exit(1);
});
