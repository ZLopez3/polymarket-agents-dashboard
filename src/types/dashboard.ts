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
  trading_mode?: 'paper' | 'live' | null
  max_position_size?: number | null
  max_orders_per_minute?: number | null
  daily_loss_limit?: number | null
  capital_allocation?: number | null
  paper_cash?: number | null
  paper_pnl?: number | null
  paper_positions?: number | null
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
  mode: string
}
export interface TradeLog {
  id: string
  strategy_id?: string | null
  event: string
  mode: string
  market_id?: string | null
  order_details?: Record<string, unknown> | null
  result?: string | null
  error?: string | null
  created_at: string
}

export interface CopyTraderWallet {
  address: string
  label: string
  winRate: number
  copyScore: number
  tier: string
  lastTrade?: string | null
  sourceUrl: string
  notes?: string
}

