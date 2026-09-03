import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export async function massiveFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) {
    throw new Error("MASSIVE_API_KEY is not configured");
  }

  const url = new URL(`https://api.massive.com${endpoint}`);
  url.searchParams.set("apiKey", apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), { cache: "no-store" });
  const payload = await response.json() as any;

  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `Massive API error: ${response.status}`);
  }

  return payload as T;
}

export async function fetchYahooQuote(symbol: string) {
  try {
    console.log(`[YahooFinance] Fetching quote for ${symbol}...`);
    
    // For yahoo-finance2, the default export is the instance itself.
    // The "is not a constructor" error happens when we try 'new yahooFinance.YahooFinance()'
    // because the package exports the singleton instance by default.
    const quote = await yahooFinance.quote(symbol);
    
    if (!quote) {
      console.warn(`[YahooFinance] No quote returned for ${symbol}`);
      return null;
    }

    console.log(`[YahooFinance] Success for ${symbol}: Price=${quote.regularMarketPrice}, Vol=${quote.regularMarketVolume}`);
    return {
      price: quote.regularMarketPrice,
      volume: quote.regularMarketVolume,
    };
  } catch (e: any) {
    console.error(`[YahooFinance] Error fetching ${symbol}:`, {
      message: e.message,
      stack: e.stack,
      details: e.details || "No additional details"
    });
    return null;
  }
}

export function easternDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}
