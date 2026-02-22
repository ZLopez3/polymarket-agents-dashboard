import type { SupabaseClient } from "@supabase/supabase-js";

interface SafeguardParams {
  supabase: SupabaseClient;
  strategyId: string;
  notional: number;
  maxPositionSize: number;
  maxOrdersPerMinute: number;
  dailyLossLimit: number;
}

interface SafeguardResult {
  passed: boolean;
  reason?: string;
}

/**
 * Runs all safety checks before allowing a live trade execution.
 * Returns { passed: true } or { passed: false, reason: "..." }
 */
export async function checkSafeguards({
  supabase,
  strategyId,
  notional,
  maxPositionSize,
  maxOrdersPerMinute,
  dailyLossLimit,
}: SafeguardParams): Promise<SafeguardResult> {
  // 1. Position size check
  if (notional > maxPositionSize) {
    return {
      passed: false,
      reason: `Position size $${notional} exceeds max $${maxPositionSize}`,
    };
  }

  // 2. Rate limit check: orders in last 60 seconds
  const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount } = await supabase
    .from("trades")
    .select("id", { count: "exact", head: true })
    .eq("strategy_id", strategyId)
    .gte("executed_at", oneMinAgo);

  if ((recentCount ?? 0) >= maxOrdersPerMinute) {
    return {
      passed: false,
      reason: `Rate limit: ${recentCount} orders in last minute (max ${maxOrdersPerMinute})`,
    };
  }

  // 3. Daily loss limit check: sum PnL today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: todayTrades } = await supabase
    .from("trades")
    .select("pnl")
    .eq("strategy_id", strategyId)
    .gte("executed_at", todayStart.toISOString());

  const dailyPnl = (todayTrades ?? []).reduce(
    (sum, t) => sum + (Number(t.pnl) || 0),
    0
  );

  if (dailyPnl <= dailyLossLimit) {
    return {
      passed: false,
      reason: `Daily loss limit hit: PnL $${dailyPnl.toFixed(2)} <= limit $${dailyLossLimit}`,
    };
  }

  return { passed: true };
}

/**
 * Logs a trade execution event to trade_logs.
 */
export async function logTradeEvent(
  supabase: SupabaseClient,
  params: {
    strategyId: string;
    event: string;
    mode: string;
    marketId?: string | null;
    orderDetails?: Record<string, unknown> | null;
    result?: string | null;
    error?: string | null;
  }
) {
  await supabase.from("trade_logs").insert({
    strategy_id: params.strategyId,
    event: params.event,
    mode: params.mode,
    market_id: params.marketId ?? null,
    order_details: params.orderDetails ?? null,
    result: params.result ?? null,
    error: params.error ?? null,
  });
}
