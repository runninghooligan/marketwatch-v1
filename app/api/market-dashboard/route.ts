import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type NewsItem = { title?: string; article_url?: string; published_utc?: string; publisher?: { name?: string } };
type DailyBar = { T?: string; o?: number; c?: number; v?: number };
type DashboardPayload = { market: { status: string; message: string }; news: Array<{ title: string; url: string; source: string }>; movers: Array<{ symbol: string; change: number; close: number; volume: number }> };
let cached: { expiresAt: number; data: DashboardPayload } | null = null;
const cacheTtlMs = 55_000;

function easternDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()); }
async function getJson(url: URL) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.error ?? payload.message ?? `Massive returned ${response.status}`));
  return payload;
}

export async function GET() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return NextResponse.json({ ...cached.data, cached: true, fetchedAt: now });
  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MASSIVE_API_KEY is not configured" }, { status: 503 });
  const statusUrl = new URL("https://api.massive.com/v1/marketstatus/now"); statusUrl.searchParams.set("apiKey", apiKey);
  const newsUrl = new URL("https://api.massive.com/v2/reference/news"); newsUrl.searchParams.set("apiKey", apiKey); newsUrl.searchParams.set("limit", "6"); newsUrl.searchParams.set("order", "desc"); newsUrl.searchParams.set("sort", "published_utc");
  const groupedUrl = new URL(`https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/${easternDate()}`); groupedUrl.searchParams.set("adjusted", "true"); groupedUrl.searchParams.set("apiKey", apiKey);
  const [statusResult, newsResult, groupedResult] = await Promise.allSettled([getJson(statusUrl), getJson(newsUrl), getJson(groupedUrl)]);
  const status = statusResult.status === "fulfilled" ? statusResult.value : {};
  const statusValue = String(status.market ?? status.status ?? "closed").toLowerCase();
  const market = { status: statusValue, message: statusValue === "open" ? "Market open" : statusValue === "extended-hours" ? "Extended hours" : "Market closed" };
  const news = newsResult.status === "fulfilled" ? ((newsResult.value.results as NewsItem[] | undefined) ?? []).map((item) => ({ title: item.title ?? "Untitled market update", url: item.article_url ?? "#", source: item.publisher?.name ?? "Market news" })) : [];
  const bars = groupedResult.status === "fulfilled" ? ((groupedResult.value.results as DailyBar[] | undefined) ?? []) : [];
  const movers = bars.filter((bar) => bar.T && typeof bar.o === "number" && typeof bar.c === "number" && bar.o > 0).map((bar) => ({ symbol: bar.T!, change: ((bar.c! - bar.o!) / bar.o!) * 100, close: bar.c!, volume: bar.v ?? 0 })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 20);
  const data = { market, news, movers } satisfies DashboardPayload;
  cached = { expiresAt: now + cacheTtlMs, data };
  return NextResponse.json({ ...data, cached: false, fetchedAt: now }, { headers: { "Cache-Control": "public, max-age=55, stale-while-revalidate=10" } });
}
