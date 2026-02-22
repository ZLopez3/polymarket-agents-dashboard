import Link from 'next/link'
import { revalidatePath } from 'next/cache'

import { supabaseAdmin } from '../../lib/supabaseAdmin'
import type { Strategy, StrategySettings } from '@/types/dashboard'
import KillSwitch from '@/app/components/KillSwitch'
import TradingModeToggle from '@/app/components/TradingModeToggle'
import TradeLogPanel from '@/app/components/TradeLogPanel'
import SaveButton from '@/app/components/SaveButton'

const defaults = {
  max_trade_notional: 200,
  max_trades_per_hour: 30,
  max_daily_notional: 2000,
  max_daily_loss: -100,
  paper_capital: 1000,
}

async function updateSettings(formData: FormData) {
  'use server'
  if (!supabaseAdmin) return

  const strategy_id = String(formData.get('strategy_id') || '')
  const paper_capital = Number(formData.get('paper_capital') || defaults.paper_capital)
  const max_trade_notional = Number(formData.get('max_trade_notional') || defaults.max_trade_notional)
  const max_trades_per_hour = Number(formData.get('max_trades_per_hour') || defaults.max_trades_per_hour)
  const max_daily_notional = Number(formData.get('max_daily_notional') || defaults.max_daily_notional)
  const max_daily_loss = Number(formData.get('max_daily_loss') || defaults.max_daily_loss)
  const divergence_threshold = Number(formData.get('divergence_threshold') || 20)
  const certainty_threshold = Number(formData.get('certainty_threshold') || 0.95)
  const liquidity_floor = Number(formData.get('liquidity_floor') || 0.5)
  const order_size_multiplier = Number(formData.get('order_size_multiplier') || 1.0)
  const max_resolution_days = Number(formData.get('max_resolution_days') || 0)

  // Live trading safeguard fields
  const max_position_size = Number(formData.get('max_position_size') || 500)
  const max_orders_per_minute = Number(formData.get('max_orders_per_minute') || 5)
  const daily_loss_limit = Number(formData.get('daily_loss_limit') || -200)
  const capital_allocation = Number(formData.get('capital_allocation') || 1000)

  if (!strategy_id) return

  await supabaseAdmin.from('strategy_settings').upsert({
    strategy_id,
    max_trade_notional,
    max_trades_per_hour,
    max_daily_notional,
    max_daily_loss,
    divergence_threshold,
    certainty_threshold,
    liquidity_floor,
    order_size_multiplier,
    max_resolution_days,
  })

  await supabaseAdmin.from('strategies').update({
    paper_capital,
    paper_cash: paper_capital,
    max_position_size,
    max_orders_per_minute,
    daily_loss_limit,
    capital_allocation,
  }).eq('id', strategy_id)

  revalidatePath('/settings')
  revalidatePath('/')
}

export default async function SettingsPage() {
  if (!supabaseAdmin) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-slate-400 mt-2">Missing SUPABASE_SERVICE_ROLE_KEY in Vercel env.</p>
      </main>
    )
  }

  const { data: rawStrategies } = await supabaseAdmin.from('strategies').select('*')
  const { data: rawSettings } = await supabaseAdmin.from('strategy_settings').select('*')

  const strategies = (rawStrategies ?? []) as Strategy[]
  const settings = (rawSettings ?? []) as StrategySettings[]

  const settingsMap = settings.reduce<Record<string, StrategySettings>>((acc, setting) => {
    acc[setting.strategy_id] = setting
    return acc
  }, {})

  const groupedByOwner = strategies.reduce<Record<string, Strategy[]>>((acc, strategy) => {
    const key = strategy.owner || 'Unassigned'
    acc[key] = acc[key] || []
    acc[key].push(strategy)
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8 space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors">
        ← Back to Dashboard
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Strategy Settings</h1>
        <KillSwitch hasLiveStrategies={strategies.some(s => s.trading_mode === 'live')} />
      </div>

      <div className="grid gap-6">
        {Object.entries(groupedByOwner).map(([group, groupStrategies]) => (
          <div key={group} className="space-y-4">
            <h2 className="text-xl font-semibold">{group}</h2>
            {groupStrategies.map((strategy) => {
              const strategySettings = settingsMap[strategy.id] || {}
              return (
                <form key={strategy.id} action={updateSettings} className="rounded-lg border border-slate-800 bg-slate-900 p-5 space-y-4">
                  <input type="hidden" name="strategy_id" value={strategy.id} />
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-medium">{strategy.name}</h2>
                      <p className="text-sm text-slate-400">Owner: {strategy.owner}</p>
                    </div>
                    <TradingModeToggle
                      strategyId={strategy.id}
                      strategyName={strategy.name}
                      initialMode={(strategy.trading_mode as 'paper' | 'live') ?? 'paper'}
                    />
                  </div>

                  <div className="text-sm text-slate-300 font-medium">Risk Settings</div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <label className="text-sm">
                      <div className="text-slate-400">Paper Capital</div>
                      <input name="paper_capital" defaultValue={strategy.paper_capital ?? defaults.paper_capital} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" step="0.01" />
                    </label>
                    <label className="text-sm">
                      <div className="text-slate-400">Max Trade Notional</div>
                      <input name="max_trade_notional" defaultValue={strategySettings.max_trade_notional ?? defaults.max_trade_notional} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" step="0.01" />
                    </label>
                    <label className="text-sm">
                      <div className="text-slate-400">Max Trades / Hour</div>
                      <input name="max_trades_per_hour" defaultValue={strategySettings.max_trades_per_hour ?? defaults.max_trades_per_hour} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" />
                    </label>
                    <label className="text-sm">
                      <div className="text-slate-400">Max Daily Notional</div>
                      <input name="max_daily_notional" defaultValue={strategySettings.max_daily_notional ?? defaults.max_daily_notional} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" step="0.01" />
                    </label>
                    <label className="text-sm">
                      <div className="text-slate-400">Max Daily Loss</div>
                      <input name="max_daily_loss" defaultValue={strategySettings.max_daily_loss ?? defaults.max_daily_loss} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" step="0.01" />
                    </label>
                  </div>

                  <div className="text-sm text-slate-300 font-medium">Live Trading Safeguards</div>
                  <div className="grid md:grid-cols-4 gap-4">
                    <label className="text-sm">
                      <div className="text-slate-400">Max Position Size ($)</div>
                      <input name="max_position_size" defaultValue={strategy.max_position_size ?? 500} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" step="1" />
                    </label>
                    <label className="text-sm">
                      <div className="text-slate-400">Max Orders / Min</div>
                      <input name="max_orders_per_minute" defaultValue={strategy.max_orders_per_minute ?? 5} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" step="1" />
                    </label>
                    <label className="text-sm">
                      <div className="text-slate-400">Daily Loss Limit ($)</div>
                      <input name="daily_loss_limit" defaultValue={strategy.daily_loss_limit ?? -200} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" step="1" />
                    </label>
                    <label className="text-sm">
                      <div className="text-slate-400">Capital Allocation ($)</div>
                      <input name="capital_allocation" defaultValue={strategy.capital_allocation ?? 1000} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" step="1" />
                    </label>
                  </div>

                  <div className="text-sm text-slate-300 font-medium">Tuning Settings</div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <label className="text-sm">
                      <div className="text-slate-400">Divergence Threshold</div>
                      <input name="divergence_threshold" defaultValue={strategySettings.divergence_threshold ?? 20} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" step="0.1" />
                    </label>
                    <label className="text-sm">
                      <div className="text-slate-400">Certainty Threshold</div>
                      <input name="certainty_threshold" defaultValue={strategySettings.certainty_threshold ?? 0.95} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" step="0.01" />
                    </label>
                    <label className="text-sm">
                      <div className="text-slate-400">Liquidity Floor (M USD)</div>
                      <input name="liquidity_floor" defaultValue={strategySettings.liquidity_floor ?? 0.5} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" step="0.01" />
                    </label>
                    <label className="text-sm">
                      <div className="text-slate-400">Order Size Multiplier</div>
                      <input name="order_size_multiplier" defaultValue={strategySettings.order_size_multiplier ?? 1.0} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" step="0.1" />
                    </label>
                    <label className="text-sm">
                      <div className="text-slate-400">Max Resolution Window (days)</div>
                      <input name="max_resolution_days" defaultValue={strategySettings.max_resolution_days ?? 0} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" type="number" step="1" min="0" />
                      <p className="text-[10px] text-slate-500 mt-1">0 = no filter. 7 = only markets resolving within 1 week.</p>
                    </label>
                  </div>

                  <SaveButton />
                </form>
              )
            })}
          </div>
        ))}
      </div>

      <TradeLogPanel limit={100} />
    </main>
  )
}
