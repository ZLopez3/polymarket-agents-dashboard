import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const strategyId = searchParams.get("strategy_id");
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);

  let query = supabaseAdmin
    .from("trade_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (strategyId) {
    query = query.eq("strategy_id", strategyId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [] });
}
