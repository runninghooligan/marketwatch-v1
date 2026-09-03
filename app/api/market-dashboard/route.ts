import { NextResponse } from "next/server";
import { massiveFetch, easternDate } from "@/lib/market-data";

export const dynamic = "force-dynamic";

type NewsItem = { title?: string; article_url?: string; published_utc?: string; publisher?: { name?: string } };
type DailyBar = { T?: string; c?: number; v?: number; t?: number };
type DashboardPayload = { market: { status: string; message: string }; news: Array<{ title: string; url: string; source: string }>; movers: Array<{ symbol: string; close: number; volume: number }>; asOf: string; source: string };
let cached: { expiresAt: number; data: DashboardPayload } | null = null;
const cacheTtlMs = 24 * 60 * 60 * 1000;
const snapshotSymbols = ["NVDA", "TSLA", "AMD", "PLTR", "COIN", "SMCI", "RIVN", "SOFI", "MARA", "ARM", "BA", "DIS", "NKE", "PFE", "BABA", "INTC", "SNAP", "SHOP", "MRNA", "WBD"];

export async function GET() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return NextResponse.json({ ...cached.data, cached: true, fetchedAt: now });

  try {
    const statusUrl = "/v1/marketstatus/now";
    const newsUrl = "/v2/reference/news";
    const [statusResult, newsResult, ...barResults] = await Promise.allSettled([
      massiveFetch<{ market: string; status: string }>(statusUrl),
      massiveFetch<{ results: NewsItem[] }> (newsUrl, { limit: "6", order: "desc", sort: "published_utc" }),
      ...snapshotSymbols.map((symbol) => massiveFetch<{ results?: DailyBar[] }>(`/v2/aggs/ticker/${symbol}/prev`, { adjusted: "true" })),
    ]);

    const status = statusResult.status === "fulfilled" ? statusResult.value : {};
    const statusValue = String(status.market ?? status.status ?? "closed").toLowerCase();
    const market = { status: statusValue, message: statusValue === "open" ? "Market open" : statusValue === "extended-hours" ? "Extended hours" : "Market closed" };

    const news = newsResult.status === "fulfilled" ? ((newsResult.value.results ?? []).map((item) => ({ title: item.title ?? "Untitled market update", url: item.article_url ?? "#", source: item.publisher?.name ?? "Market news" }))) : [];

    // This is deliberately a daily, delayed snapshot. The `prev` endpoint gives
    // each ticker's last completed trading bar, including on weekends and holidays.
    const movers = barResults
      .flatMap((result, index) => result.status === "fulfilled" ? (result.value.results ?? []).map((bar) => ({ ...bar, T: bar.T ?? snapshotSymbols[index] })) : [])
      .filter((bar) => bar.T && typeof bar.c === "number" && typeof bar.v === "number")
      .sort((a, b) => (b.v ?? 0) - (a.v ?? 0))
      .map((bar) => ({ symbol: bar.T!, close: bar.c!, volume: bar.v! }));
    const latestTimestamp = barResults.flatMap((result) => result.status === "fulfilled" ? (result.value.results ?? []).map((bar) => bar.t).filter((value): value is number => typeof value === "number") : []).sort((a, b) => b - a)[0];
    const asOf = latestTimestamp ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(latestTimestamp)) : easternDate();
    const data = { market, news, movers, asOf, source: "Massive delayed daily aggregates" } satisfies DashboardPayload;
    cached = { expiresAt: now + cacheTtlMs, data };
    return NextResponse.json({ ...data, cached: false, fetchedAt: now }, { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
