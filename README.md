# Polymarket Agents Dashboard

Next.js + Tailwind dashboard for monitoring strategy agents, trades, and alerts.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Create `.env.local`**
   ```bash
   cp .env.example .env.local
   ```
   Fill in your Supabase project values.
3. **Run dev server**
   ```bash
   npm run dev
   ```

## Environment variables

| Name | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key for read-only client |

## Data model (Supabase)

- `strategies`: id, name, status, owner, bankroll_pct, updated_at
- `agents`: id, name, strategy_id, status, last_heartbeat
- `trades`: id, strategy_id, market, side, notional, pnl, executed_at
- `events`: id, agent_id, type, severity, message, created_at

The execution/risk wrapper should write to `trades` + `events`. This dashboard only needs read access via the anon key.
