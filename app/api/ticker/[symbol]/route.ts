import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;
let cache = new Map<string, { expiresAt: number; data: Json }>();
const ttl = 24 * 60 * 60 * 1000;

async function fetchJson(url: URL) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json() as Json;
  if (!response.ok) throw new Error(String(payload.error ?? payload.message ?? `Massive returned ${response.status}`));
  return payload;
}

export async function GET(_request: Request, { params }: { params: { symbol: string } }) {
  const symbol = decodeURIComponent(params.symbol).toUpperCase().trim();
  if (!/^[A-Z0-9.:-]{1,15}$/.test(symbol)) return NextResponse.json({ error: "Invalid ticker symbol" }, { status: 400 });
  const now = Date.now();
  const existing = cache.get(symbol);
  if (existing && existing.expiresAt > now) return NextResponse.json({ ...existing.data, cached: true });
  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MASSIVE_API_KEY is not configured" }, { status: 503 });
  const detailUrl = new URL(`https://api.massive.com/v3/reference/tickers/${encodeURIComponent(symbol)}`); detailUrl.searchParams.set("apiKey", apiKey);
  const closeUrl = new URL(`https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev`); closeUrl.searchParams.set("adjusted", "true"); closeUrl.searchParams.set("apiKey", apiKey);
  const newsUrl = new URL("https://api.massive.com/v2/reference/news"); newsUrl.searchParams.set("ticker", symbol); newsUrl.searchParams.set("limit", "5"); newsUrl.searchParams.set("order", "desc"); newsUrl.searchParams.set("sort", "published_utc"); newsUrl.searchParams.set("apiKey", apiKey);
  const [detailResult, closeResult, newsResult] = await Promise.allSettled([fetchJson(detailUrl), fetchJson(closeUrl), fetchJson(newsUrl)]);
  const detail = detailResult.status === "fulfilled" ? detailResult.value.results ?? detailResult.value : null;
  const bar = closeResult.status === "fulfilled" ? ((closeResult.value.results as Array<{ c?: number; o?: number; h?: number; l?: number; v?: number; t?: number }> | undefined)?.[0] ?? null) : null;
  const news = newsResult.status === "fulfilled" ? ((newsResult.value.results as Array<{ title?: string; article_url?: string; published_utc?: string; publisher?: { name?: string } }> | undefined) ?? []).map((item) => ({ title: item.title ?? "Untitled market update", url: item.article_url ?? "#", publishedAt: item.published_utc ?? "", source: item.publisher?.name ?? "Market news" })) : [];
  const data = { symbol, detail, previousClose: bar, news, fetchedAt: now };
  cache.set(symbol, { expiresAt: now + ttl, data });
  return NextResponse.json({ ...data, cached: false }, { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600" } });
}
