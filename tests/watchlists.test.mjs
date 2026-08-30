import test from "node:test";
import assert from "node:assert/strict";
import { changeWatchlists as change, initialWatchlists, readWatchlists } from "../lib/watchlists.ts";

test("saved lists retain names, selected list and ticker order after reload", () => {
  let state = initialWatchlists();
  state = change(state, { type: "create", id: "etfs", name: " ETF ideas " });
  for (const symbol of [" voo ", "QQQ", "BRK.B"]) state = change(state, { type: "add", id: "etfs", symbol });
  const beforeMove = state;
  state = change(state, { type: "move", id: "etfs", symbol: "BRK.B", direction: -1 });
  assert.deepEqual(beforeMove.lists[1].symbols, ["VOO", "QQQ", "BRK.B"]);
  state = change(state, { type: "rename", id: "etfs", name: "Core candidates" });
  const restored = readWatchlists(JSON.stringify(state));
  assert.deepEqual(restored, state);
  assert.equal(restored.activeId, "etfs");
  assert.equal(restored.lists[1].name, "Core candidates");
  assert.deepEqual(restored.lists[1].symbols, ["VOO", "BRK.B", "QQQ"]);
});

test("duplicate symbols and duplicate names do not alter existing data", () => {
  let state = change(initialWatchlists(), { type: "add", id: "my-watchlist", symbol: "NVDA" });
  const saved = JSON.stringify(state);
  assert.throws(() => change(state, { type: "add", id: "my-watchlist", symbol: " nvda " }), /already/);
  assert.throws(() => change(state, { type: "create", id: "new", name: "My WATCHLIST" }), /already/);
  assert.throws(() => change(state, { type: "add", id: "my-watchlist", symbol: "<script>" }), /ticker/);
  assert.equal(JSON.stringify(state), saved);
});

test("delete/remove support restoration and last-list deletion stays empty on reload", () => {
  const state = change(initialWatchlists(), { type: "add", id: "my-watchlist", symbol: "AAPL" });
  const removed = change(state, { type: "remove", id: "my-watchlist", symbol: "AAPL" });
  assert.deepEqual(removed.lists[0].symbols, []);
  assert.deepEqual(state.lists[0].symbols, ["AAPL"]);
  const deleted = change(state, { type: "delete", id: "my-watchlist" });
  assert.deepEqual(readWatchlists(JSON.stringify(deleted)), { version: 1, lists: [], activeId: "" });
  assert.deepEqual(readWatchlists(JSON.stringify(state)).lists[0].symbols, ["AAPL"]);
});

test("bad or incompatible stored data is rejected rather than silently reset", () => {
  for (const raw of ["{broken", "null", '{"version":2,"lists":[]}', JSON.stringify({ version: 1, lists: [{ id: "x", name: "Ideas", symbols: ["AAPL", "AAPL"] }], activeId: "x" }), JSON.stringify({ version: 1, lists: [], activeId: "missing" })]) assert.throws(() => readWatchlists(raw));
  assert.deepEqual(readWatchlists(null), initialWatchlists());
});

test("reorder boundaries and cross-list saves preserve independent collections", () => {
  let state = change(initialWatchlists(), { type: "add", id: "my-watchlist", symbol: "NVDA" });
  const original = state;
  state = change(state, { type: "move", id: "my-watchlist", symbol: "NVDA", direction: -1 });
  assert.deepEqual(state, original);
  state = change(state, { type: "create", id: "two", name: "Second list" });
  state = change(state, { type: "add", id: "two", symbol: "NVDA" });
  state = change(state, { type: "remove", id: "two", symbol: "NVDA" });
  assert.deepEqual(state.lists[0].symbols, ["NVDA"]);
  assert.deepEqual(state.lists[1].symbols, []);
});
