"use client";
import "./watchlists.css";
import { useEffect, useMemo, useState } from "react";
import { ListDestination, SaveTicker, WatchlistFeedback, WatchlistsPanel, useWatchlists, type TickerResearch, type WatchlistStore } from "./watchlists";
import { normalizeSymbol, validSymbol } from "../lib/watchlists";
type Tab = "overview" | "research" | "watchlists";
type M = {
    symbol: string;
    name: string;
    price: string;
    change: number;
    volume: string;
};
const symbols = ["NVDA", "SMCI", "PLTR", "TSLA", "COIN", "AMD", "RIVN", "SOFI", "MARA", "ARM", "BA", "DIS", "NKE", "PFE", "BABA", "INTC", "SNAP", "SHOP", "MRNA", "WBD"];
const fallback: M[] = symbols.map((symbol, i) => ({ symbol, name: "Market summary ticker", price: "—", change: [5.92, 5.21, 4.86, 4.18, 3.75, 3.51, 3.19, 2.87, 2.64, 2.31, -2.18, -2.44, -2.76, -3.08, -3.42, -3.85, -4.11, -4.54, -5.06, -5.83][i], volume: "—" }));
function Research({ symbol, store }: { symbol: string; store: WatchlistStore }) {
  const [data, setData] = useState<TickerResearch | null>(null);
  const [error, setError] = useState("");
  const cached = store.records[symbol];
  const remember = store.remember;
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setData(null);
    if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < 300_000) { setData(cached); return; }
    fetch("/api/ticker/" + encodeURIComponent(symbol), { signal: controller.signal })
      .then(async r => { const payload = await r.json(); if (!r.ok) throw Error(payload.error ?? "Research is unavailable."); return payload as TickerResearch; })
      .then(payload => { if (!controller.signal.aborted) { setData(payload); remember(symbol, payload); } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [symbol, cached, remember]);
  const d = data?.detail, b = data?.previousClose;
  const change = b?.o && b.c != null ? (b.c - b.o) / b.o * 100 : null;
  return <div className="research-panel"><p className="eyebrow">TICKER RESEARCH / FREE TIER</p><h2>{symbol}<em>{d?.name ? " · " + d.name : ""}</em></h2>
    {error ? <p className="empty-copy" role="alert">{error}</p> : !data ? <p role="status">Loading research…</p> : <>
      <div className="metric-grid"><div><span>Latest close</span><strong>{b?.c != null ? "$" + b.c.toFixed(2) : "—"}</strong></div>
        <div><span>Open → close</span><strong className={change != null && change < 0 ? "negative" : "positive"}>{change != null ? (change >= 0 ? "+" : "") + change.toFixed(2) + "%" : "—"}</strong></div>
        <div><span>Volume</span><strong>{b?.v?.toLocaleString() ?? "—"}</strong></div></div>
      <div className="research-columns"><article className="research-card"><p className="eyebrow">ABOUT</p><p>{d?.description ?? "Company description is not available for this ticker on the current plan."}</p></article>
        <article className="research-card"><p className="eyebrow">PROFILE</p><p><b>Exchange</b><br/>{d?.primary_exchange ?? "—"}</p><p><b>Security type</b><br/>{d?.type ?? "—"}</p><p><b>Market cap</b><br/>{d?.market_cap ? "$" + (d.market_cap / 1e9).toFixed(1) + "B" : "—"}</p></article></div>
      <div className="research-card"><p className="eyebrow">RECENT NEWS</p>{data.news?.length ? data.news.map((n, i) => <a className="news-item" href={n.url} target="_blank" rel="noreferrer" key={i}><span>{n.source}</span><strong>{n.title}</strong></a>) : <p className="empty-copy">No recent ticker headlines available.</p>}</div>
    </>}
  </div>;
}
export default function Home() {
const watchlists = useWatchlists();
const [draft, setDraft] = useState("NVDA");
const [tickerError, setTickerError] = useState("");
const openResearch = (symbol: string) => { setSelected(symbol); setDraft(symbol); setTab("research"); setTickerError(""); };
 const [tab, setTab] = useState<Tab>("overview"); const [q, setQ] = useState(""); const [selected, setSelected] = useState("NVDA"); const [movers, setMovers] = useState<M[]>(fallback); const [idx, setIdx] = useState<any[]>([{ name: "S&P 500", symbol: "I:SPX", value: "—", change: "Not on current plan" }, { name: "NASDAQ 100", symbol: "I:NDX", value: "—", change: "Latest close" }, { name: "DOW", symbol: "I:DJI", value: "—", change: "Not on current plan" }]); const [mkt, setMkt] = useState({ message: "Checking market status", status: "closed" }); const [clock, setClock] = useState(""); useEffect(() => { const t = () => setClock(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" })); t(); const i = setInterval(t, 1000); return () => clearInterval(i); }, []); useEffect(() => { let active = true; const go = async () => { try {
    const [ir, dr] = await Promise.all([fetch("/api/market-indices"), fetch("/api/market-dashboard")]);
    const ip = await ir.json(), dp = await dr.json();
    if (!active) return;
    const map = new Map<string, { value: number | null }>((ip.quotes ?? []).map((x: { symbol: string; value: number | null }) => [x.symbol, x]));
    setIdx(x => x.map(v => { const q = map.get(v.symbol); return q?.value == null ? v : { ...v, value: q.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), change: "Latest close" }; }));
    if (dp.movers?.length)
        setMovers(dp.movers.map((x: any) => ({ symbol: x.symbol, name: "Market summary ticker", price: "$" + x.close.toFixed(2), change: x.change, volume: x.volume.toLocaleString() })));
    setMkt(dp.market ?? { message: "Market status unavailable", status: "closed" });
}
catch { } }; go(); const i = setInterval(go, 60000); return () => { active = false; clearInterval(i); }; }, []); const rows = useMemo(() => movers.filter(x => (x.symbol + " " + x.name).toLowerCase().includes(q.toLowerCase())), [movers, q]); const open = mkt.status === "open"; return <main><nav className="nav shell"><a className="brand" href="#top"><span className="brand-mark">M</span>Market<span>Pulse</span></a><div className="nav-tabs">{(["overview", "research", "watchlists"] as Tab[]).map(x => <button aria-current={tab === x ? "page" : undefined} className={tab === x ? "active" : ""} onClick={() => setTab(x)} key={x}>{x === "overview" ? "Overview" : x === "research" ? "Research" : "Watchlists"}</button>)}{["Screener", "ETF compare"].map(x => <button className="disabled" disabled key={x}>{x}</button>)}</div><div className="nav-meta"><span className={"signal " + (open ? "is-open" : "is-closed")}><i />{mkt.message.toUpperCase()}</span><span className="clock">{clock}</span></div></nav><WatchlistFeedback store={watchlists}/>{tab === "overview" ? <><section id="top" className="hero shell"><div><p className="eyebrow">US EQUITIES / RECENT SNAPSHOT</p><h1>Follow the market’s<br /><em>biggest moves.</em></h1><p className="intro">Recent activity, daily movers, headlines, and the latest available index close.</p></div><div className="market-card"><span className="card-label">MARKET PULSE</span><strong>{mkt.message}</strong><p>Refreshes every minute with server-side caching.</p></div></section><section className="index-strip"><div className="shell index-grid">{idx.map(x => <div className="index" key={x.symbol}><span>{x.name}</span><strong>{x.value}</strong><em className={x.change === "Latest close" ? "positive" : "negative"}>{x.change}</em></div>)}</div></section><section className="shell board"><div className="board-heading"><div><p className="eyebrow">LATEST DAILY SUMMARY</p><h2>Top 20 movers</h2></div></div><div className="controls"><ListDestination store={watchlists}/><button className="wl-button" onClick={() => setTab("watchlists")}>Manage lists</button><label className="search"><span>⌕</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ticker or company" aria-label="Search ticker or company"/></label></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Company</th><th>Last price</th><th>Day change</th><th>Volume</th><th></th></tr></thead><tbody>{rows.map((x, i) => <tr key={x.symbol}><td className="rank">{i + 1}</td><td><button className="company research-link" onClick={() => { openResearch(x.symbol); }}><span className="ticker">{x.symbol.slice(0, 1)}</span><div><strong>{x.symbol}</strong><small>{x.name}</small></div></button></td><td className="price">{x.price}</td><td><span className={x.change < 0 ? "change down" : "change up"}>{x.change > 0 ? "+" : ""}{x.change.toFixed(2)}%</span></td><td>{x.volume}</td><td><button className="text-button" onClick={() => { openResearch(x.symbol); }}>Research →</button><SaveTicker symbol={x.symbol} store={watchlists}/></td></tr>)}</tbody></table></div></section></> : tab === "watchlists" ? <WatchlistsPanel store={watchlists} research={openResearch}/> : <section className="shell research-hero"><div className="research-picker"><p className="eyebrow">RESEARCH WORKSPACE</p><h1>Find your next<br /><em>well-researched idea.</em></h1><form className="wl-inline-form" onSubmit={e => { e.preventDefault(); const symbol = normalizeSymbol(draft); if (validSymbol(symbol)) openResearch(symbol); else setTickerError("Enter a valid ticker such as NVDA or VOO."); }}>
<label className="search"><span>⌕</span><input value={draft} maxLength={15} onChange={e => setDraft(e.target.value.toUpperCase())} placeholder="Enter a ticker, e.g. NVDA" aria-label="Ticker symbol" required /></label><button className="wl-button primary">Research ticker</button></form>
{tickerError && <p role="alert">{tickerError}</p>}<div className="wl-inline-form"><ListDestination store={watchlists}/><SaveTicker symbol={selected} store={watchlists}/><button className="wl-button" onClick={() => setTab("watchlists")}>Manage lists</button></div><p className="research-note">Press Enter to load a ticker.</p></div><Research symbol={selected || "NVDA"} store={watchlists}/></section>}<footer className="shell"><span>MARKETPULSE</span><p>Market data is delayed and for informational purposes only. Not investment advice.</p><span>© 2026</span></footer></main>; }
