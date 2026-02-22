import { NextResponse } from "next/server";
import { testConnection, createPolyClient } from "@/lib/polymarket";

/**
 * GET /api/poly/test
 *
 * Tests the Polymarket CLOB connection:
 *  1. Verifies the API endpoint is reachable
 *  2. Derives L2 API credentials from POLY_PRIVATE_KEY
 *  3. Fetches a sample active market to confirm auth works
 *
 * Returns connection status, wallet address (masked), and a sample market.
 */
export async function GET() {
  try {
    // Step 1: Check basic connectivity
    const { ok, host, chainId } = await testConnection();

    // Step 2: Fetch a sample market to verify full auth
    const client = await createPolyClient();
    const markets = await client.getMarkets({
      next_cursor: "MA==",
    });

    const sampleMarket = markets.data?.[0] ?? null;

    // Mask the public key for display
    const pubKey = process.env.POLY_PUBLIC_KEY ?? "";
    const maskedKey = pubKey
      ? `${pubKey.slice(0, 6)}...${pubKey.slice(-4)}`
      : "NOT SET";

    return NextResponse.json({
      status: "connected",
      endpoint: host,
      chainId,
      apiOk: ok,
      wallet: maskedKey,
      sampleMarket: sampleMarket
        ? {
            conditionId: sampleMarket.condition_id,
            question: sampleMarket.question,
            tokens: sampleMarket.tokens?.map((t: { token_id: string; outcome: string }) => ({
              tokenId: t.token_id,
              outcome: t.outcome,
            })),
            minimumTickSize: sampleMarket.minimum_tick_size,
          }
        : null,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { status: "error", message },
      { status: 500 }
    );
  }
}
