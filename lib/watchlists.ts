export type Watchlist = { id: string; name: string; symbols: string[] };
export type WatchlistState = { version: 1; lists: Watchlist[]; activeId: string };
export const STORAGE_KEY = "marketpulse.watchlists.v1";
export const validSymbol = (symbol: string) => /^[A-Z0-9][A-Z0-9.:-]{0,14}$/.test(symbol);
export const normalizeSymbol = (value: string) => value.trim().toUpperCase();
export const initialWatchlists = (): WatchlistState => ({ version: 1, lists: [{ id: "my-watchlist", name: "My watchlist", symbols: [] }], activeId: "my-watchlist" });

// Validate before restoring: never overwrite an unreadable stored collection.
export function readWatchlists(raw: string | null): WatchlistState {
  if (raw === null) return initialWatchlists();
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.lists) || value.lists.length > 20 || typeof value.activeId !== "string") throw Error("Unsupported saved watchlists.");
  const ids = new Set<string>(); const names = new Set<string>();
  for (const list of value.lists) {
    if (!list || typeof list.id !== "string" || !list.id || ids.has(list.id) || typeof list.name !== "string" || !list.name.trim() || list.name.length > 40 || names.has(list.name.trim().toLowerCase()) || !Array.isArray(list.symbols) || list.symbols.length > 100 || list.symbols.some((s: unknown) => typeof s !== "string" || !validSymbol(s)) || new Set(list.symbols).size !== list.symbols.length) throw Error("Invalid saved watchlists.");
    ids.add(list.id); names.add(list.name.trim().toLowerCase());
  }
  if (value.lists.length ? !ids.has(value.activeId) : value.activeId !== "") throw Error("Invalid selected watchlist.");
  return { version: 1, lists: value.lists.map((l: Watchlist) => ({ id: l.id, name: l.name, symbols: [...l.symbols] })), activeId: value.activeId };
}

export type WatchlistAction =
  | { type: "create"; id: string; name: string }
  | { type: "select"; id: string }
  | { type: "delete"; id: string }
  | { type: "rename"; id: string; name: string }
  | { type: "add"; id: string; symbol: string }
  | { type: "remove"; id: string; symbol: string }
  | { type: "move"; id: string; symbol: string; direction: -1 | 1 };

export function changeWatchlists(state: WatchlistState, action: WatchlistAction): WatchlistState {
  const lists = state.lists.map(l => ({ ...l, symbols: [...l.symbols] }));
  const list = lists.find(l => l.id === action.id);
  if (action.type === "create" || action.type === "rename") {
    const name = action.name.trim();
    if (!name || name.length > 40) throw Error("Use a list name between 1 and 40 characters.");
    if (lists.some(l => l.name.toLowerCase() === name.toLowerCase() && (action.type === "create" || l.id !== action.id))) throw Error("A list with that name already exists.");
    if (action.type === "create") {
      if (lists.length >= 20) throw Error("You can keep up to 20 watchlists.");
      if (!action.id || list) throw Error("Could not create this list. Try again.");
      return { version: 1, lists: [...lists, { id: action.id, name, symbols: [] }], activeId: action.id };
    }
    if (!list) throw Error("Choose a watchlist first.");
    list.name = name;
  } else {
    if (!list) throw Error("Create or choose a watchlist first.");
    if (action.type === "select") return { ...state, activeId: action.id };
    if (action.type === "delete") {
      const remaining = lists.filter(l => l.id !== action.id);
      return { version: 1, lists: remaining, activeId: state.activeId === action.id ? remaining[0]?.id ?? "" : state.activeId };
    }
    const symbol = normalizeSymbol(action.symbol);
    if (!validSymbol(symbol)) throw Error("Enter a ticker such as NVDA, VOO, or BRK.B.");
    const index = list.symbols.indexOf(symbol);
    if (action.type === "add") {
      if (index !== -1) throw Error(symbol + " is already in this list.");
      if (list.symbols.length >= 100) throw Error("You can save up to 100 tickers per list.");
      list.symbols.push(symbol);
    } else if (action.type === "remove") list.symbols = list.symbols.filter(s => s !== symbol);
    else if (index !== -1) {
      const target = index + action.direction;
      if (target >= 0 && target < list.symbols.length) [list.symbols[index], list.symbols[target]] = [list.symbols[target], list.symbols[index]];
    }
  }
  return { ...state, lists };
}
