import { NextResponse } from "next/server";
import { massiveFetch, easternDate, fetchYahooQuote } from "@/lib/market-data";

export const dynamic = "force-dynamic";

type NewsItem = { title?: string; article_url?: string; published_utc?: string; publisher?: { name?: string } };
type DailyBar = { T?: string; o?: number; c?: number; v?: number };
type DashboardPayload = { market: { status: string; message: string }; news: Array<{ title: string; url: string; source: string }>; movers: Array<{ symbol: string; close: number; volume: number }>; asOf: string };
let cached: { expiresAt: number; data: DashboardPayload } | null = null;
const cacheTtlMs = 55_000;

export async function GET() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return NextResponse.json({ ...cached.data, cached: true, fetchedAt: now });

  try {
    const statusUrl = "/v1/marketstatus/now";
    const newsUrl = "/v2/reference/news";
    const groupedUrl = `/v2/aggs/grouped/locale/us/market/stocks/${easternDate()}`;

    const [statusResult, newsResult, groupedResult] = await Promise.allSettled([
      massiveFetch<{ market: string; status: string }>(statusUrl),
      massiveFetch<{ results: NewsItem[] }> (newsUrl, { limit: "6", order: "desc", sort: "published_utc" }),
      massiveFetch<{ results: DailyBar[] }>(groupedUrl, { adjusted: "true" }),
    ]);

    const status = statusResult.status === "fulfilled" ? statusResult.value : {};
    const statusValue = String(status.market ?? status.status ?? "closed").toLowerCase();
    const market = { status: statusValue, message: statusValue === "open" ? "Market open" : statusValue === "extended-hours" ? "Extended hours" : "Market closed" };

    const news = newsResult.status === "fulfilled" ? ((newsResult.value.results ?? []).map((item) => ({ title: item.title ?? "Untitled market update", url: item.article_url ?? "#", source: item.publisher?.name ?? "Market news" }))) : [];

    const bars = groupedResult.status === "fulfilled" ? (groupedResult.value.results ?? []) : [];
    
    const movers = (await Promise.all(
      // Use the latest grouped daily snapshot and rank by activity rather than
      // an inferred open-to-close percentage move.
      bars
        .filter((bar) => bar.T && typeof bar.c === "number" && typeof bar.v === "number")
        .sort((a, b) => (b.v ?? 0) - (a.v ?? 0))
        .slice(0, 20)
        .map(async (bar) => {
          const symbol = bar.T!;
          let close = bar.c!;
          let volume = bar.v ?? 0;

          if (volume === 0 || !close) {
            try {
              const yahoo = await fetchYahooQuote(symbol);
              if (yahoo) {
                close = yahoo.price ?? close;
                volume = yahoo.volume ?? volume;
              }
            } catch (e) {
              // Fallback to original values
            }
          }

          return {
            symbol,
            close,
            volume,
          };
        })
    ));

    const data = { market, news, movers, asOf: easternDate() } satisfies DashboardPayload;
    cached = { expiresAt: now + cacheTtlMs, data };
    return NextResponse.json({ ...data, cached: false, fetchedAt: now }, { headers: { "Cache-Control": "public, max-age=55, stale-while-revalidate=10" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
