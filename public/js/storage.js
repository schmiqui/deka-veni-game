// Ukladanie rebríčka.
// Primárne na server (súbor data/scores.json na disku), a zároveň kópia
// v localStorage prehliadača. Ak server nebeží, výsledky sa uložia lokálne
// a pri ďalšej synchronizácii sa odošlú.
window.Storage = (() => {
  'use strict';

  const CACHE_KEY = 'dobryPastier.scores.v1';
  const PENDING_KEY = 'dobryPastier.pending.v1';
  const fileMode = location.protocol === 'file:';

  let scores = readLS(CACHE_KEY);
  let pending = readLS(PENDING_KEY);
  let online = false;
  let boardCache = null;

  function readLS(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  function writeLS(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* plný alebo zakázaný localStorage – server je primárne úložisko */
    }
  }

  function setScores(list) {
    scores = list;
    boardCache = null;
    writeLS(CACHE_KEY, scores);
  }

  function withPending(list) {
    const ids = new Set(list.map((s) => s.id));
    return list.concat(pending.filter((p) => !ids.has(p.id)));
  }

  async function post(entry) {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    // 400 = server záznam odmietol; netreba ho skúšať donekonečna.
    if (!res.ok && res.status !== 400) throw new Error(`HTTP ${res.status}`);
  }

  async function flush() {
    while (pending.length) {
      await post(pending[0]);
      pending = pending.slice(1);
      writeLS(PENDING_KEY, pending);
    }
  }

  async function sync() {
    if (fileMode) return;
    try {
      await flush();
      const res = await fetch('/api/scores', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      online = true;
      setScores(withPending(data.scores || []));
    } catch {
      online = false;
      setScores(withPending(scores));
    }
  }

  function add(entry) {
    setScores(scores.concat(entry));
    if (fileMode) return;
    pending = pending.concat(entry);
    writeLS(PENDING_KEY, pending);
    flush().then(
      () => (online = true),
      () => (online = false),
    );
  }

  const keyOf = (name) => name.trim().toLowerCase();

  // Rebríček: najlepší výsledok každého hráča (rovnaká prezývka = jeden hráč).
  function board() {
    if (boardCache) return boardCache;
    const best = new Map();
    for (const s of scores) {
      const k = keyOf(s.name);
      const cur = best.get(k);
      if (!cur || s.score > cur.score || (s.score === cur.score && s.date < cur.date)) best.set(k, s);
    }
    boardCache = [...best.entries()]
      .map(([key, s]) => ({ key, ...s }))
      .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
    return boardCache;
  }

  function bestFor(key) {
    const row = board().find((r) => r.key === key);
    return row ? row.score : null;
  }

  return {
    sync,
    add,
    board,
    bestFor,
    keyOf,
    get totalGames() {
      return scores.length;
    },
    get status() {
      if (fileMode) return 'local';
      return online && !pending.length ? 'online' : 'offline';
    },
  };
})();
