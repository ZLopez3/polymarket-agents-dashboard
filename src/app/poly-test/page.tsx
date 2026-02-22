import { testConnection, createPolyClient } from "@/lib/polymarket";

export const dynamic = "force-dynamic";

export default async function PolyTestPage() {
  let result: Record<string, unknown>;

  try {
    console.log("[v0] poly-test page: starting connection test...");

    const { ok, host, chainId } = await testConnection();
    console.log("[v0] poly-test page: connectivity ok=", ok);

    const client = await createPolyClient();
    console.log("[v0] poly-test page: client created, fetching markets...");

    const markets = await client.getMarkets({ next_cursor: "MA==" });
    const sample = markets.data?.[0] ?? null;
    console.log("[v0] poly-test page: sample market=", sample?.question ?? "none");

    const pubKey = process.env.POLY_PUBLIC_KEY ?? "";
    const masked = pubKey ? `${pubKey.slice(0, 6)}...${pubKey.slice(-4)}` : "NOT SET";

    result = {
      status: "connected",
      endpoint: host,
      chainId,
      apiOk: ok,
      wallet: masked,
      sampleMarket: sample
        ? {
            conditionId: sample.condition_id,
            question: sample.question,
            tokens: sample.tokens?.map((t: { token_id: string; outcome: string }) => ({
              tokenId: t.token_id,
              outcome: t.outcome,
            })),
            minimumTickSize: sample.minimum_tick_size,
          }
        : null,
    };
  } catch (error: unknown) {
    console.error("[v0] poly-test page ERROR:", error);
    result = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }

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
