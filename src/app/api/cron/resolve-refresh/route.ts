import { NextResponse } from 'next/server'
import { supabase, verifyCronSecret, unauthorizedResponse, fetchJson } from '../_lib/supabase'

const POLY_AGENT_API_BASE = 'https://gzydspfquuaudqeztorw.supabase.co/functions/v1/agent-api'

// Resolve Refresher: checks unresolved trades and updates close/resolution status
// Schedule: every night at 3 AM UTC
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) return unauthorizedResponse()

  const { data: trades, error } = await supabase
    .from('trades')
    .select('id,market,market_slug,is_resolved,closes_at')
    .eq('is_resolved', false)
    .limit(50)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let updated = 0
  let failed = 0

  for (const t of trades || []) {
    const slug = t.market_slug
    if (!slug) continue

    try {
      const details = await fetchJson(
        `${POLY_AGENT_API_BASE}?action=market&slug=${encodeURIComponent(slug)}`
      )
      const data = details.data || {}

      const { error: updateError } = await supabase
        .from('trades')
        .update({
          closes_at: data.closes_at || t.closes_at,
          is_resolved: data.is_resolved ?? t.is_resolved,
        })
        .eq('id', t.id)

      if (updateError) {
        failed++
      } else {
        updated++
      }
    } catch {
      failed++
    }
  }

  return NextResponse.json({ ok: true, updated, failed, total: (trades || []).length })
}
