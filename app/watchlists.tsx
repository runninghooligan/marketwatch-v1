"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { changeWatchlists, initialWatchlists, normalizeSymbol, readWatchlists, STORAGE_KEY, validSymbol, type WatchlistAction, type WatchlistState } from "../lib/watchlists";

export type TickerResearch = {
  detail?: { name?: string; description?: string; primary_exchange?: string; type?: string; market_cap?: number } | null;
  previousClose?: { c?: number; o?: number; v?: number; t?: number } | null;
  news?: Array<{ title: string; url: string; source: string }>;
  fetchedAt?: number;
};
export function useWatchlists() {
  const [state, setState] = useState(initialWatchlists);
  const current = useRef(state);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [warning, setWarning] = useState("");
  const [message, setMessage] = useState("");
  const [undoState, setUndoState] = useState<WatchlistState | null>(null);
  const [records, setRecords] = useState<Record<string, TickerResearch>>({});
  useEffect(() => {
    let raw: string | null;
    try { raw = window.localStorage.getItem(STORAGE_KEY); }
    catch { setWarning("Browser storage is unavailable. Changes will last only until this page closes."); setReady(true); return; }
    try { const saved = readWatchlists(raw); current.current = saved; setState(saved); }
    catch { setLocked(true); setWarning("Saved watchlists could not be read. Your stored data has not been overwritten. List editing is disabled."); }
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || (event.key !== STORAGE_KEY && event.key !== null)) return;
      try { const saved = readWatchlists(event.newValue); current.current = saved; setState(saved); setUndoState(null); setLocked(false); setWarning(""); setMessage("Watchlists updated from another tab."); }
      catch { setLocked(true); setWarning("Another tab saved unreadable watchlists. Editing is paused to protect your lists."); }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const persist = (next: WatchlistState) => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setWarning(""); }
    catch { setWarning("Could not save in this browser. Changes are held in memory; keep this page open."); }
    current.current = next; setState(next);
  };
  const act = (action: WatchlistAction, success = "") => {
    if (!ready || locked) return false;
    try {
      const previous = current.current;
      const next = changeWatchlists(previous, action);
      persist(next);
      setUndoState(action.type === "delete" || action.type === "remove" ? previous : null);
      setMessage(success); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update the list."); return false; }
  };
  const undo = () => { if (undoState && !locked) { persist(undoState); setUndoState(null); setMessage("Restored."); } };
  const remember = useCallback((symbol: string, research: TickerResearch) => {
    setRecords(previous => ({ ...previous, [symbol]: research }));
  }, []);
  const active = state.lists.find(list => list.id === state.activeId);
  return { state, active, ready, locked, warning, message, act, undo, undoState, records, remember };
}
export type WatchlistStore = ReturnType<typeof useWatchlists>;

export function ListDestination({ store }: { store: WatchlistStore }) {
  return <label className="wl-destination">Save to
    <select aria-label="Watchlist to save tickers to" value={store.state.activeId} disabled={!store.ready || store.locked || !store.state.lists.length} onChange={e => store.act({ type: "select", id: e.target.value })}>
      {!store.state.lists.length && <option value="">Create a watchlist first</option>}
      {store.state.lists.map(list => <option value={list.id} key={list.id}>{list.name}</option>)}
    </select>
  </label>;
}
export function SaveTicker({ symbol, store }: { symbol: string; store: WatchlistStore }) {
  const saved = store.active?.symbols.includes(symbol);
  return <button className={"wl-button wl-save" + (saved ? " is-saved" : "")} disabled={!store.ready || store.locked || !store.active || saved || !validSymbol(symbol)} title={store.active ? (saved ? "Saved in " : "Save to ") + store.active.name : "Create a watchlist first"} aria-label={(saved ? "Saved " : "Save ") + symbol + (store.active ? " in " + store.active.name : "")}
    onClick={() => store.act({ type: "add", id: store.state.activeId, symbol }, symbol + " saved to " + store.active?.name + ".")}>{saved ? "✓ Saved" : "+ Save"}</button>;
}

export function WatchlistFeedback({ store }: { store: WatchlistStore }) {
  return <div className="shell wl-feedback">
    {store.warning && <p role="alert" className="wl-warning">{store.warning}</p>}
    <div role="status" aria-live="polite">{store.message}{store.undoState && <button className="wl-button" onClick={store.undo}>Undo</button>}</div>
  </div>;
}

function dateLabel(time?: number) {
  return time && Number.isFinite(time) ? new Date(time).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }) : "Date unavailable";
}
export function WatchlistsPanel({ store, research }: { store: WatchlistStore; research: (symbol: string) => void }) {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { active, locked, ready } = store;
  return <section className="shell wl-workspace" aria-labelledby="watchlists-title">
    <header className="wl-heading"><div><p className="eyebrow">YOUR RESEARCH SHORTLIST</p><h1 id="watchlists-title">Watchlists</h1><p>Keep your ideas organized. Open a ticker to continue researching.</p></div><span className="wl-local">Saved in this browser · No account required</span></header>
    <div className="wl-layout"><aside className="wl-sidebar">
      <h2>Your lists <span>{store.state.lists.length}</span></h2>
      <nav aria-label="Choose a watchlist">{store.state.lists.map(list => <button key={list.id} className={list.id === active?.id ? "selected" : ""} aria-current={list.id === active?.id ? "true" : undefined} onClick={() => { store.act({ type: "select", id: list.id }); setConfirmDelete(null); setRenaming(null); }} disabled={locked || !ready}><span>{list.name}</span><small>{list.symbols.length}</small></button>)}</nav>
      <form className="wl-create" onSubmit={event => { event.preventDefault(); if (store.act({ type: "create", id: crypto.randomUUID(), name }, "Watchlist created.")) setName(""); }}>
        <label htmlFor="new-list">New watchlist</label><input id="new-list" maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Long-term ideas" disabled={!ready || locked} required />
        <button className="wl-button primary" disabled={!ready || locked || !name.trim()}>+ Create list</button>
      </form><p className="wl-hint">Lists do not sync between devices. Clearing this site’s browser data removes them.</p>
    </aside><div className="wl-content">
      {!ready ? <p role="status" className="empty-copy">Loading your watchlists…</p> : !active ? <div className="wl-empty"><h2>A place for your next idea</h2><p>Create a watchlist to start collecting stocks, ETFs, and fund symbols.</p></div> : <>
        <div className="wl-list-heading"><div><h2>{active.name}</h2><p>{active.symbols.length} saved {active.symbols.length === 1 ? "ticker" : "tickers"}</p></div><div className="wl-actions"><button className="wl-button" disabled={locked} onClick={() => { setRenaming(active.id); setNewName(active.name); setConfirmDelete(null); }}>Rename</button><button className="wl-button danger" disabled={locked} onClick={() => { setConfirmDelete(active.id); setRenaming(null); }}>Delete list</button></div></div>
        {renaming === active.id && <form className="wl-inline-form" onSubmit={e => { e.preventDefault(); if (store.act({ type: "rename", id: active.id, name: newName }, "List renamed.")) setRenaming(null); }}><label htmlFor="rename-list">List name</label><input id="rename-list" value={newName} maxLength={40} onChange={e => setNewName(e.target.value)} required /><button className="wl-button primary">Save name</button><button type="button" className="wl-button" onClick={() => setRenaming(null)}>Cancel</button></form>}
        {confirmDelete === active.id && <div className="wl-confirm" role="alert"><p>Delete “{active.name}” and its {active.symbols.length} saved tickers? You can undo this immediately afterward.</p><button className="wl-button danger" onClick={() => { store.act({ type: "delete", id: active.id }, "Watchlist deleted."); setConfirmDelete(null); }}>Delete this list</button><button className="wl-button" onClick={() => setConfirmDelete(null)}>Keep list</button></div>}
        <form className="wl-inline-form" onSubmit={e => { e.preventDefault(); const symbol = normalizeSymbol(ticker); if (store.act({ type: "add", id: active.id, symbol }, symbol + " added.")) setTicker(""); }}><label htmlFor="watchlist-ticker">Add a ticker</label><input id="watchlist-ticker" placeholder="NVDA, VOO, BRK.B…" maxLength={15} value={ticker} onChange={e => setTicker(e.target.value)} autoCapitalize="characters" spellCheck={false} required disabled={locked} /><button className="wl-button primary" disabled={locked || !ticker.trim()}>+ Add ticker</button></form>
        <p className="wl-hint">Quotes and headlines reuse Research data from this session. Open Research to load or refresh a ticker. Saving a symbol doesn’t verify Massive coverage.</p>
        {active.symbols.length === 0 ? <div className="wl-empty"><span aria-hidden="true">☆</span><h3>Your shortlist starts here</h3><p>Add a ticker above, or use “+ Save” from Overview or Research.</p><button className="wl-button" onClick={() => research("NVDA")}>Explore a ticker →</button></div> : <div className="table-wrap wl-table"><table><thead><tr><th>Ticker</th><th>Latest close</th><th>Open → close</th><th>Volume</th><th>Recent headline</th><th>Organize</th></tr></thead><tbody>{active.symbols.map((symbol, index) => {
          const record = store.records[symbol]; const bar = record?.previousClose;
          const close = typeof bar?.c === "number" && Number.isFinite(bar.c) ? bar.c : null;
          const change = close !== null && bar?.o && bar.o > 0 ? (close - bar.o) / bar.o * 100 : null;
          const headline = record?.news?.[0];
          return <tr key={symbol}><td><button className="wl-ticker" onClick={() => research(symbol)}>{symbol} ↗</button><small>{record?.detail?.name ?? "Open Research to load data"}</small></td><td><strong>{close === null ? "—" : close.toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong><small>{close !== null ? dateLabel(bar?.t) : "Not loaded"}</small></td><td className={change === null ? "" : change < 0 ? "negative" : "positive"}>{change === null ? "—" : (change >= 0 ? "+" : "") + change.toFixed(2) + "%"}</td><td>{bar?.v?.toLocaleString("en-US") ?? "—"}</td><td className="wl-headline">{headline && /^https?:\/\//i.test(headline.url) ? <a href={headline.url} target="_blank" rel="noreferrer">{headline.title}</a> : <span>No headline loaded</span>}</td><td><div className="wl-row-actions"><button className="wl-button" disabled={locked || index === 0} aria-label={"Move " + symbol + " up"} onClick={() => store.act({ type: "move", id: active.id, symbol, direction: -1 }, symbol + " moved up.")}>↑</button><button className="wl-button" disabled={locked || index === active.symbols.length - 1} aria-label={"Move " + symbol + " down"} onClick={() => store.act({ type: "move", id: active.id, symbol, direction: 1 }, symbol + " moved down.")}>↓</button><button className="wl-button" disabled={locked} aria-label={"Remove " + symbol + " from " + active.name} onClick={() => store.act({ type: "remove", id: active.id, symbol }, symbol + " removed.")}>Remove</button></div></td></tr>;
        })}</tbody></table></div>}
      </>}
    </div></div>
  </section>;
}
