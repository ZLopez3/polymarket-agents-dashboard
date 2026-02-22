import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 })
  }

  const body = await req.json()
  const { wallet_address, wallet_label } = body as { wallet_address?: string; wallet_label?: string }

  if (!wallet_address || !/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
  }

  const addr = wallet_address.toLowerCase()
  const label = (wallet_label || addr.slice(0, 8)).replace(/[^a-zA-Z0-9_ -]/g, '')

  // Check if a mirror strategy already exists for this wallet
  const { data: existing } = await supabaseAdmin
    .from('strategies')
    .select('id, name')
    .contains('mirror_wallets', [addr])
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'Mirror strategy already exists for this wallet', strategy: existing[0] }, { status: 409 })
  }

  // Find the Cot agent to assign to
  const { data: agents } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('name', 'Cot')
    .limit(1)

  const cotAgentId = agents?.[0]?.id ?? null

  // Create the mirror strategy
  const strategyName = `Whale Mirror - ${label}`
  const { data: newStrategy, error } = await supabaseAdmin
    .from('strategies')
    .insert({
      name: strategyName,
      owner: 'Cot',
      agent_id: cotAgentId,
      trading_mode: 'paper',
      paper_capital: 100,
      paper_cash: 100,
      paper_pnl: 0,
      paper_positions: 0,
      capital_allocation: 100,
      max_position_size: 500,
      max_orders_per_minute: 5,
      daily_loss_limit: -200,
      mirror_wallets: [addr],
      mode_switched_at: new Date().toISOString(),
    })
    .select('id, name')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also insert default strategy_settings
  await supabaseAdmin.from('strategy_settings').insert({
    strategy_id: newStrategy.id,
    max_trade_notional: 50,
    max_trades_per_hour: 5,
    max_daily_notional: 200,
    max_daily_loss: -100,
    divergence_threshold: 20,
    certainty_threshold: 0.95,
    liquidity_floor: 0.5,
    order_size_multiplier: 1.0,
    max_resolution_days: 0,
  })

  return NextResponse.json({ ok: true, strategy: newStrategy })
}
