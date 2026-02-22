import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { testConnection } from "@/lib/polymarket";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: strategyId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const mode = body.mode as string;

  if (mode !== "paper" && mode !== "live") {
    return NextResponse.json(
      { error: "mode must be 'paper' or 'live'" },
      { status: 400 }
    );
  }

  // --- Precondition checks for going live ---
  if (mode === "live") {
    if (!process.env.POLY_PRIVATE_KEY || !process.env.POLY_PUBLIC_KEY) {
      return NextResponse.json(
        { error: "Polymarket wallet keys not configured (POLY_PRIVATE_KEY / POLY_PUBLIC_KEY)" },
        { status: 422 }
      );
    }

    try {
      const { ok } = await testConnection();
      if (!ok) throw new Error("API returned not ok");
    } catch {
      return NextResponse.json(
        { error: "Cannot reach Polymarket API. Check network and credentials." },
        { status: 422 }
      );
    }
  }

  // --- Build the update payload ---
  const updatePayload: Record<string, unknown> = { trading_mode: mode };

  // When switching to live, reset the portfolio to start fresh with capital_allocation
  if (mode === "live") {
    const { data: current } = await supabaseAdmin
      .from("strategies")
      .select("capital_allocation, paper_capital")
      .eq("id", strategyId)
      .single();

    const startingCapital = current?.capital_allocation ?? current?.paper_capital ?? 1000;
    updatePayload.paper_cash = startingCapital;
    updatePayload.paper_pnl = 0;
    updatePayload.paper_positions = 0;
  }

  // --- Update the strategy ---
  const { data, error } = await supabaseAdmin
    .from("strategies")
    .update(updatePayload)
    .eq("id", strategyId)
    .select("id, name, trading_mode")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // --- Log the mode change ---
  await supabaseAdmin.from("trade_logs").insert({
    strategy_id: strategyId,
    event: "mode_change",
    mode,
    result: mode === "live"
      ? `Switched to live – portfolio reset to $${updatePayload.paper_cash}`
      : `Switched to ${mode}`,
  });

  return NextResponse.json({ strategy: data });
}
