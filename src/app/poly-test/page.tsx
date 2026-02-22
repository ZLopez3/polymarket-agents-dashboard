import { testConnection, testAuth, createPolyClient } from "@/lib/polymarket";

export const dynamic = "force-dynamic";

export default async function PolyTestPage() {
  const steps: Record<string, unknown> = {};

  // Step 1: Basic unauthenticated ping
  try {
    console.log("[v0] poly-test: Step 1 - basic connectivity...");
    const conn = await testConnection();
    steps.connectivity = { status: "ok", ...conn };
    console.log("[v0] poly-test: Step 1 passed, ok=", conn.ok);
  } catch (error: unknown) {
    console.error("[v0] poly-test: Step 1 FAILED:", error);
    steps.connectivity = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
    return renderResult(steps);
  }

  // Step 2: Derive API credentials
  try {
    console.log("[v0] poly-test: Step 2 - deriving API keys...");
    const auth = await testAuth();
    steps.authentication = { status: "ok", ...auth };
    console.log("[v0] poly-test: Step 2 passed");
  } catch (error: unknown) {
    console.error("[v0] poly-test: Step 2 FAILED:", error);
    steps.authentication = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
    return renderResult(steps);
  }

  // Step 3: Fetch a sample market
  try {
    console.log("[v0] poly-test: Step 3 - fetching sample market...");
    const client = await createPolyClient();
    const markets = await client.getSamplingSimplifiedMarkets();
    const sample = markets.data?.[0] ?? null;
    console.log("[v0] poly-test: Step 3 passed, market=", sample?.question ?? "none");

    const pubKey = process.env.POLY_PUBLIC_KEY ?? "";
    const masked = pubKey ? `${pubKey.slice(0, 6)}...${pubKey.slice(-4)}` : "NOT SET";

    steps.wallet = masked;
    steps.sampleMarket = sample
      ? {
          conditionId: sample.condition_id,
          question: sample.question,
          tokens: sample.tokens?.map((t: { token_id: string; outcome: string }) => ({
            tokenId: t.token_id,
            outcome: t.outcome,
          })),
          minimumTickSize: sample.minimum_tick_size,
        }
      : null;
  } catch (error: unknown) {
    console.error("[v0] poly-test: Step 3 FAILED:", error);
    steps.sampleMarket = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return renderResult(steps);
}

function renderResult(result: Record<string, unknown>) {
  return (
    <main className="min-h-screen bg-slate-950 text-white p-8 font-mono">
      <h1 className="text-2xl font-bold mb-6">Polymarket Connection Test</h1>
      <pre className="bg-slate-900 p-6 rounded-lg overflow-x-auto text-sm leading-relaxed">
        {JSON.stringify(result, null, 2)}
      </pre>
      <a href="/" className="mt-6 inline-block text-teal-400 hover:underline">
        Back to Dashboard
      </a>
    </main>
  );
}
