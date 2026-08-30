import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type MassiveIndex = { ticker?: string; name?: string; value?: number; timeframe?: string; last_updated?: number; session?: { change?: number; change_percent?: number; close?: number } };
type IndexQuote = { symbol: string; name: string; value: number | null; changePercent: number | null; timeframe: string | null; updatedAt: number | null };
const indexSymbols = ["I:SPX", "I:COMP", "I:DJI"] as const;
const cacheTtlMs = 55_000;
let cached: { expiresAt: number; quotes: IndexQuote[] } | null = null;
const emptyQuote = (symbol: string): IndexQuote => ({ symbol, name: symbol, value: null, changePercent: null, timeframe: null, updatedAt: null });

export async function GET() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return NextResponse.json({ quotes: cached.quotes, cached: true, fetchedAt: now });
  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MASSIVE_API_KEY is not configured", quotes: indexSymbols.map(emptyQuote) }, { status: 503 });
  // Three parallel snapshots per refresh; at one refresh/minute this is only 3 calls/minute.
  const quotes = await Promise.all(indexSymbols.map(async (symbol) => {
    try {
      const url = new URL("https://api.massive.com/v3/snapshot/indices");
      url.searchParams.set("ticker", symbol);
      url.searchParams.set("apiKey", apiKey);
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Massive returned ${response.status}`);
      const payload = await response.json() as { results?: MassiveIndex[] };
      const index = payload.results?.[0] ?? {};
      const session = index.session ?? {};
      return { symbol, name: index.name ?? symbol, value: index.value ?? session.close ?? null, changePercent: session.change_percent ?? null, timeframe: index.timeframe ?? null, updatedAt: index.last_updated ?? null } satisfies IndexQuote;
    } catch { return emptyQuote(symbol); }
  }));
  cached = { expiresAt: now + cacheTtlMs, quotes };
  return NextResponse.json({ quotes, cached: false, fetchedAt: now }, { headers: { "Cache-Control": "public, max-age=55, stale-while-revalidate=10" } });
}
