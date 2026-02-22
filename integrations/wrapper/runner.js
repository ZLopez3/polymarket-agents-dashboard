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
  HEARTBEAT_INTERVAL_MS = 60000,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const wrapperUrl = WRAPPER_URL || `http://localhost:${PORT}`;

async function getAgentIds() {
  const { data, error } = await supabase.from('agents').select('id,name');
  if (error) throw error;
  return data || [];
}

async function postHeartbeat(agentId, status = 'ok', detail = 'alive') {
  const res = await fetch(`${wrapperUrl}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId, status, detail }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('Heartbeat failed', agentId, txt);
  }
}

async function run() {
  let agents = await getAgentIds();
  if (agents.length === 0) {
    console.error('No agents found in Supabase.');
  }

  console.log(`Heartbeat runner online for ${agents.length} agents.`);

  // initial ping
  for (const a of agents) {
    await postHeartbeat(a.id, 'ok', 'boot');
  }

  setInterval(async () => {
    try {
      // refresh agents occasionally in case new ones are added
      agents = await getAgentIds();
      await Promise.all(agents.map((a) => postHeartbeat(a.id, 'ok', 'alive')));
    } catch (err) {
      console.error('Heartbeat runner error', err?.message || err);
    }
  }, Number(HEARTBEAT_INTERVAL_MS));
}

run().catch((err) => {
  console.error('Runner failed', err?.message || err);
  process.exit(1);
});
