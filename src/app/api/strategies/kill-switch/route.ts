import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST() {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 }
    );
  }

  // Set ALL strategies to paper mode
  const { data, error } = await supabaseAdmin
    .from("strategies")
    .update({ trading_mode: "paper" })
    .neq("trading_mode", "paper")
    .select("id, name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const affected = data?.length ?? 0;

  // Log the kill switch event
  await supabaseAdmin.from("trade_logs").insert({
    event: "kill_switch",
    mode: "paper",
    result: `Emergency stop: ${affected} strategies switched to paper`,
  });

  return NextResponse.json({
    success: true,
    affected,
    message: `${affected} strategies switched to paper mode`,
  });
}
