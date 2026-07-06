// Memoizes an async function's result for `ttlMs` milliseconds. Concurrent
// calls while a fetch is in flight share the same pending promise rather
// than firing the underlying function multiple times.
//
// `now` is injectable for tests; defaults to the wall clock.
export function memoizeWithTtl<T>(
  fn: () => Promise<T>,
  ttlMs: number,
  now: () => number = Date.now
): () => Promise<T> {
  let cached: { value: T; at: number } | undefined;
  let pending: Promise<T> | undefined;

  return async () => {
    const t = now();
    if (cached && t - cached.at < ttlMs) {
      return cached.value;
    }
    if (pending) {
      return pending;
    }

    pending = (async () => {
      try {
        const value = await fn();
        cached = { value, at: now() };
        return value;
      } finally {
        pending = undefined;
      }
    })();

    return pending;
  };
}
