import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

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

  if (!strategy_id) return

  await supabaseAdmin.from('strategy_settings').upsert({
    strategy_id,
    max_trade_notional,
    max_trades_per_hour,
    max_daily_notional,
    max_daily_loss,
  })

  await supabaseAdmin.from('strategies').update({ paper_capital }).eq('id', strategy_id)

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

  const { data: strategies } = await supabaseAdmin.from('strategies').select('*')
  const { data: settings } = await supabaseAdmin.from('strategy_settings').select('*')

  const settingsMap = Object.fromEntries((settings || []).map((s: any) => [s.strategy_id, s]));

  const groupedByOwner = (strategies || []).reduce((acc: any, s: any) => {
    const key = s.owner || 'Unassigned';
    acc[key] = acc[key] || [];
    acc[key].push(s);
    return acc;
  }, {} as Record<string, any[]>);


  return (
    <main className="min-h-screen bg-slate-950 text-white p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Strategy Settings</h1>
        <a href="/" className="text-slate-400 hover:text-white">← Back</a>
      </div>

      <div className="grid gap-6">
        {Object.entries(groupedByOwner).map(([group, groupStrategies]) => (
          <div key={group} className="space-y-4">
            <h2 className="text-xl font-semibold">{group}</h2>
            {(groupStrategies as any[]).map((strategy: any) => {
              const s = settingsMap[strategy.id] || {}
              return (
                <form
                  key={strategy.id}
                  action={updateSettings}
                  className="rounded-lg border border-slate-800 bg-slate-900 p-5 space-y-4"
                >
              <input type="hidden" name="strategy_id" value={strategy.id} />
              <div>
                <h2 className="text-xl font-medium">{strategy.name}</h2>
                <p className="text-sm text-slate-400">Owner: {strategy.owner}</p>
              </div>

              <div className="text-sm text-slate-300 font-medium">Risk Settings</div>
              <div className="grid md:grid-cols-3 gap-4">
                <label className="text-sm">
                  <div className="text-slate-400">Paper Capital</div>
                  <input
                    name="paper_capital"
                    defaultValue={strategy.paper_capital ?? defaults.paper_capital}
                    className="mt-1 w-full rounded bg-slate-800 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-slate-400">Max Trade Notional</div>
                  <input
                    name="max_trade_notional"
                    defaultValue={s.max_trade_notional ?? defaults.max_trade_notional}
                    className="mt-1 w-full rounded bg-slate-800 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-slate-400">Max Trades / Hour</div>
                  <input
                    name="max_trades_per_hour"
                    defaultValue={s.max_trades_per_hour ?? defaults.max_trades_per_hour}
                    className="mt-1 w-full rounded bg-slate-800 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-slate-400">Max Daily Notional</div>
                  <input
                    name="max_daily_notional"
                    defaultValue={s.max_daily_notional ?? defaults.max_daily_notional}
                    className="mt-1 w-full rounded bg-slate-800 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-slate-400">Max Daily Loss</div>
                  <input
                    name="max_daily_loss"
                    defaultValue={s.max_daily_loss ?? defaults.max_daily_loss}
                    className="mt-1 w-full rounded bg-slate-800 px-3 py-2"
                  />
                </label>
              </div>

              <button
                type="submit"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
              >
                Save Settings
              </button>
                </form>
              )
            })}
          </div>
        ))}
      </div>
    </main>
  )
}
