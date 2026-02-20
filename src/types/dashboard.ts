export type MarketSide = 'YES' | 'NO'

export interface Strategy {
  id: string
  name: string
  owner?: string | null
  status?: string | null
  paper_capital?: number | null
  agent_id?: string | null
  bankroll_pct?: number | null
  created_at?: string | null
}

export interface StrategySettings {
  strategy_id: string
  max_trade_notional?: number | null
  max_trades_per_hour?: number | null
  max_daily_notional?: number | null
  max_daily_loss?: number | null
  divergence_threshold?: number | null
  certainty_threshold?: number | null
  liquidity_floor?: number | null
  order_size_multiplier?: number | null
}

export interface Agent {
  id: string
  name: string
  agent_type?: string | null
  strategy_id?: string | null
  status?: string | null
}

export interface Trade {
  id: string
  strategy_id: string
  market: string
  side: MarketSide
  notional?: number | null
  pnl?: number | null
  closes_at?: string | null
  executed_at?: string | null
  market_id?: string | null
  market_slug?: string | null
  is_resolved?: boolean | null
}

export interface AgentEvent {
  id: string
  agent_id?: string | null
  event_type?: string | null
  severity?: string | null
  message?: string | null
  created_at?: string | null
}

export interface AgentHeartbeat {
  id: string
  agent_id: string
  status?: string | null
  created_at?: string | null
}

export interface StrategyStats extends Strategy {
  pnl: number
  notional: number
  tradeCount: number
  equity: number
  base: number
}

export interface AgentRow extends Agent {
  portfolio: number
  pnl: number
  cash: number
  positions: number
  trades: number
}
