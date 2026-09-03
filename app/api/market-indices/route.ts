import { NextResponse } from "next/server";
import { massiveFetch, fetchYahooQuote } from "@/lib/market-data";

export const dynamic = "force-dynamic";

type Aggregate = { c?: number; t?: number };
type IndexQuote = { symbol: string; name: string; value: number | null; changePercent: number | null; timeframe: "previous_close" | "real-time" | "delayed" | null; updatedAt: number | null; error?: string };

const indexSymbols = [
  { symbol: "I:NDX", name: "NASDAQ 100" },
  { symbol: "I:SPX", name: "S&P 500" },
  { symbol: "I:DJI", name: "DOW JONES" },
] as const;
const cacheTtlMs = 55_000;
let cached: { expiresAt: number; quotes: IndexQuote[] } | null = null;

export async function GET() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return NextResponse.json({ quotes: cached.quotes, cached: true, fetchedAt: now });

  const results = await Promise.all(indexSymbols.map(async ({ symbol, name }) => {
    try {
      const quote = await massiveFetch<{ results: Array<{ price: number; change_percent: number }> }>(`/v1/quotes/${symbol}`);
      const q = quote.results?.[0];
      if (q) {
        return { symbol, name, value: q.price, changePercent: q.change_percent, timeframe: "real-time", updatedAt: Date.now() } satisfies IndexQuote;
      }
      throw new Error("No real-time quote available");
    } catch (error) {
      try {
        const yahooSymbol = symbol === "I:NDX" ? "^NDX" : symbol === "I:SPX" ? "^GSPC" : symbol === "I:DJI" ? "^DJI" : symbol;
        const yahoo = await fetchYahooQuote(yahooSymbol);
        if (yahoo) {
          return { symbol, name, value: yahoo.price, changePercent: null, timeframe: "delayed", updatedAt: Date.now() } satisfies IndexQuote;
        }
        throw new Error("Yahoo fallback failed");
      } catch (yahooError) {
        try {
          const prev = await massiveFetch<{ results: Aggregate[] }>(`/v2/aggs/ticker/${symbol}/prev`);
          const bar = prev.results?.[0];
          if (bar?.c) {
            return { symbol, name, value: bar.c, changePercent: null, timeframe: "previous_close", updatedAt: bar.t ?? null } satisfies IndexQuote;
          }
          throw new Error("No previous close available");
        } catch (fallbackError) {
          return { symbol, name, value: null, changePercent: null, timeframe: null, updatedAt: null, error: fallbackError instanceof Error ? fallbackError.message : "Fetch failed" } satisfies IndexQuote;
        }
      }
    }
  }));

  cached = { expiresAt: now + cacheTtlMs, quotes: results };
  const hasValue = results.some((quote) => quote.value !== null);
  return NextResponse.json({ quotes: results, cached: false, fetchedAt: now }, { status: hasValue ? 200 : 502, headers: { "Cache-Control": "public, max-age=55, stale-while-revalidate=10" } });
}
