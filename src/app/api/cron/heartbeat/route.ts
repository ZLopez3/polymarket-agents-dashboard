import { NextResponse } from 'next/server'
import { supabase, verifyCronSecret, unauthorizedResponse } from '../_lib/supabase'

// Pings heartbeat for every agent in the DB
// Schedule: every 1 minute
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) return unauthorizedResponse()

  const { data: agents, error } = await supabase.from('agents').select('id,name')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: string[] = []

  for (const agent of agents || []) {
    const { error: hbError } = await supabase.from('agent_heartbeats').insert({
      agent_id: agent.id,
      status: 'ok',
      detail: 'alive',
    })
    results.push(hbError ? `${agent.name}: FAIL` : `${agent.name}: ok`)
  }

  return NextResponse.json({ ok: true, agents: results })
}
