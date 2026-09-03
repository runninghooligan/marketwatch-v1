import { NextResponse } from "next/server";

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

export function easternDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}
