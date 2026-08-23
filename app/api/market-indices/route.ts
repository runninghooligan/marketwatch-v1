import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Aggregate = { c?: number; t?: number };
type IndexQuote = { symbol: string; name: string; value: number | null; changePercent: number | null; timeframe: "previous_close" | null; updatedAt: number | null; error?: string };

// Indices Basic supports aggregate data, but not /v3/snapshot/indices.
const indexSymbols = [
  { symbol: "I:NDX", name: "NASDAQ 100" },
] as const;
const cacheTtlMs = 55_000;
let cached: { expiresAt: number; quotes: IndexQuote[] } | null = null;

export async function GET() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return NextResponse.json({ quotes: cached.quotes, cached: true, fetchedAt: now });
  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MASSIVE_API_KEY is not configured", quotes: indexSymbols.map(({ symbol, name }) => ({ symbol, name, value: null, changePercent: null, timeframe: null, updatedAt: null } satisfies IndexQuote)) }, { status: 503 });

  const results = await Promise.all(indexSymbols.map(async ({ symbol, name }) => {
    const url = new URL(`https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev`);
    url.searchParams.set("adjusted", "true");
    url.searchParams.set("apiKey", apiKey);
    try {
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json() as { results?: Aggregate[]; error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? `Massive returned ${response.status}`);
      const bar = payload.results?.[0];
      if (!bar?.c) throw new Error(payload.error ?? "No previous close returned");
      return { symbol, name, value: bar.c, changePercent: null, timeframe: "previous_close", updatedAt: bar.t ?? null } satisfies IndexQuote;
    } catch (error) {
      return { symbol, name, value: null, changePercent: null, timeframe: null, updatedAt: null, error: error instanceof Error ? error.message : "Upstream request failed" } satisfies IndexQuote;
    }
  }));
  cached = { expiresAt: now + cacheTtlMs, quotes: results };
  const hasValue = results.some((quote) => quote.value !== null);
  return NextResponse.json({ quotes: results, cached: false, fetchedAt: now }, { status: hasValue ? 200 : 502, headers: { "Cache-Control": "public, max-age=55, stale-while-revalidate=10" } });
}
