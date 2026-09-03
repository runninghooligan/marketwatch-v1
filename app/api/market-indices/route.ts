import { NextResponse } from "next/server";
import { massiveFetch } from "@/lib/market-data";

export const dynamic = "force-dynamic";

type Aggregate = { c?: number; t?: number };
type IndexQuote = { symbol: string; name: string; value: number | null; changePercent: number | null; timeframe: "previous_close" | null; updatedAt: number | null; error?: string };

const indexSymbols = [
  { symbol: "I:NDX", name: "NASDAQ 100" },
  { symbol: "I:SPX", name: "S&P 500" },
  { symbol: "I:DJI", name: "DOW JONES" },
] as const;
const cacheTtlMs = 24 * 60 * 60 * 1000;
let cached: { expiresAt: number; quotes: IndexQuote[] } | null = null;

export async function GET() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return NextResponse.json({ quotes: cached.quotes, cached: true, fetchedAt: now });

  const results = await Promise.all(indexSymbols.map(async ({ symbol, name }) => {
    try {
      const previous = await massiveFetch<{ results: Aggregate[] }>(`/v2/aggs/ticker/${symbol}/prev`, { adjusted: "true" });
      const bar = previous.results?.[0];
      if (bar?.c) return { symbol, name, value: bar.c, changePercent: null, timeframe: "previous_close", updatedAt: bar.t ?? null } satisfies IndexQuote;
      throw new Error("No previous close available");
    } catch (error) {
      return { symbol, name, value: null, changePercent: null, timeframe: null, updatedAt: null, error: error instanceof Error ? error.message : "Fetch failed" } satisfies IndexQuote;
    }
  }));

  cached = { expiresAt: now + cacheTtlMs, quotes: results };
  const hasValue = results.some((quote) => quote.value !== null);
  return NextResponse.json({ quotes: results, cached: false, fetchedAt: now }, { status: hasValue ? 200 : 502, headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600" } });
}
