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
  POLYVISION_API_KEY,
  PORT = 3090,
  WRAPPER_URL,
  FIN_INTERVAL_MS = 6 * 60 * 60 * 1000, // 6 hours
  FIN_TOP_WALLETS = 5,
  FIN_HOT_BETS = 5,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!POLYVISION_API_KEY) {
  console.error('Missing POLYVISION_API_KEY for Fin insights.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const wrapperUrl = WRAPPER_URL || `http://localhost:${PORT}`;
const FIN_AGENT_NAME = 'Fin-Agent';

async function ensureFinAgent() {
  const { data, error } = await supabase.from('agents').select('id').eq('name', FIN_AGENT_NAME).maybeSingle();
  if (error) {
    throw error;
  }
  if (data?.id) return data.id;
  const { data: inserted, error: insertError } = await supabase
    .from('agents')
    .insert({ name: FIN_AGENT_NAME, agent_type: 'research', status: 'active' })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return inserted.id;
}

async function fetchPolyVision(pathname, params = '') {
  const url = `https://api.polyvisionx.com${pathname}${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${POLYVISION_API_KEY}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PolyVision error ${res.status}: ${txt}`);
  }
  return res.json();
}

function shortlistWallets(entries, max = 5) {
  const filtered = entries
    .filter((entry) => entry.win_rate >= 50 || (entry.copy_score ?? 0) >= 8)
    .slice(0, max)
    .map((entry) => ({
      address: entry.wallet_address,
      label: entry.username || entry.wallet_address.slice(0, 8),
      winRate: entry.win_rate,
      copyScore: entry.copy_score,
      pnl: entry.total_pnl,
      tier: entry.tier,
      categories: entry.categories,
      redFlags: entry.red_flags || [],
      lastTrade: entry.last_trade_date,
    }));
  return filtered;
}

function summarizeWallet(wallet) {
  const categories = wallet.categories || {};
  const categoryEntries = Object.entries(categories)
    .filter(([, pct]) => pct && pct > 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name, pct]) => `${name.replace('_pct', '')} ${pct.toFixed(1)}%`);
  const categorySummary = categoryEntries.length ? `Focus: ${categoryEntries.join(', ')}` : 'Focus: mixed';
  const redFlag = wallet.redFlags?.find((flag) => !flag.includes('No major'));
  const scoreText = typeof wallet.copyScore === 'number' ? wallet.copyScore.toFixed(1) : wallet.copyScore || '?';
  const parts = [`• ${wallet.label}`, `(${wallet.winRate.toFixed(1)}% win, score ${scoreText}) — ${categorySummary}`];
  if (redFlag) {
    parts.push(`⚠️ ${redFlag}`);
  }
  return parts.join(' ');
}

function summarizeHotBets(bets, max = 5) {
  return bets.slice(0, max).map((bet) => {
    const pnl = bet.unrealized_pnl ?? bet.pnl ?? 0;
    const trader = bet.username || (bet.wallet ? `${bet.wallet.slice(0, 8)}…` : 'anon');
    return `• ${bet.market_title} (${bet.outcome}) — ${trader} | EV ${pnl.toFixed(2)} @ ${bet.current_price}`;
  });
}

async function postEvent(agentId, message, detail = 'fin_insight') {
  const res = await fetch(`${wrapperUrl}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId, event_type: 'fin_insight', severity: 'info', message, detail }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('Fin event failed', txt);
  }
}

async function generateInsight(agentId) {
  const nowLabel = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const leaderboard = await fetchPolyVision('/v1/leaderboard', '?sort_by=rank');
  const hotBets = await fetchPolyVision('/v1/hot-bets', `?limit=${FIN_HOT_BETS}`);

  const wallets = shortlistWallets(leaderboard.entries || [], Number(FIN_TOP_WALLETS));
  const walletSummary = wallets.length ? wallets.map(summarizeWallet).join('\n') : '• No elite wallets met the win-rate filter today.';
  const betsSummary = hotBets?.bets?.length ? summarizeHotBets(hotBets.bets, Number(FIN_HOT_BETS)).join('\n') : '• No hot bets published.';

  const message = [`Fin Insight (${nowLabel})`, '', 'Top wallets:', walletSummary, '', 'Hot bets:', betsSummary].join('\n');
  await postEvent(agentId, message);
  console.log('Fin insight posted', nowLabel);
}

async function run() {
  const agentId = await ensureFinAgent();
  console.log('Fin insights online. Agent:', agentId);
  await generateInsight(agentId);
  setInterval(() => {
    generateInsight(agentId).catch((err) => console.error('Fin insight error', err?.message || err));
  }, Number(FIN_INTERVAL_MS));
}

run().catch((err) => {
  console.error('Fin runner failed', err?.message || err);
  process.exit(1);
});
