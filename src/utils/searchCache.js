// Share successful searches and in-flight work; cancelled/failed searches can retry.
export function createSearchCache({ ttl = 30 * 60000, maxEntries = 32, now = Date.now,
  storage = () => null, storageKey = 'melloway.placeSearches.v1' } = {}) {
  const values = new Map(), pending = new Map();
  let restored = false;
  function prune() {
    for (const [key, entry] of values) if (entry.expires <= now()) values.delete(key);
    while (values.size > maxEntries) values.delete(values.keys().next().value);
  }
  function restore() {
    if (restored) return;
    restored = true;
    try {
      const entries = JSON.parse(storage()?.getItem(storageKey) || '[]');
      if (Array.isArray(entries)) for (const [key, entry] of entries) {
        if (typeof key === 'string' && Number.isFinite(entry?.expires) && entry.expires > now()) values.set(key, entry);
      }
    } catch { /* Memory caching still works when session storage is unavailable. */ }
    prune();
  }
  function save() {
    prune();
    try { storage()?.setItem(storageKey, JSON.stringify([...values])); } catch { /* Storage is optional. */ }
  }
  return {
    async get(key, load, { signal, cacheable = () => true } = {}) {
      signal?.throwIfAborted();
      restore();
      prune();
      if (values.has(key)) return structuredClone(values.get(key).value);
      let entry = pending.get(key);
      if (!entry) {
        entry = { controller: new AbortController(), users: 0 };
        entry.promise = Promise.resolve().then(() => load(entry.controller.signal)).then(value => {
          if (!entry.controller.signal.aborted && cacheable(value)) {
            values.set(key, { value: structuredClone(value), expires: now() + ttl });
            save();
          }
          return value;
        }).finally(() => { if (pending.get(key) === entry) pending.delete(key); });
        pending.set(key, entry);
      }
      entry.users++;
      return new Promise((resolve, reject) => {
        let settled = false;
        function finish(callback, value) {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', cancel);
          entry.users--;
          callback(value);
        }
        function cancel() {
          finish(reject, signal.reason);
          if (!entry.users) {
            entry.controller.abort();
            if (pending.get(key) === entry) pending.delete(key);
          }
        }
        signal?.addEventListener('abort', cancel, { once: true });
        entry.promise.then(value => finish(resolve, structuredClone(value)), error => finish(reject, error));
      });
    },
  };
}
