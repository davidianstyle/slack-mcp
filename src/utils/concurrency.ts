// Runs `fn` over `items` with at most `concurrency` in flight at once,
// preserving input order in the result array. Used for fan-out API calls
// (e.g. one conversations.info per channel) where doing all of them
// sequentially is slow but doing them all at once risks tripping rate
// limits.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

export interface SettledMapResult<R> {
  // Successful results only, in input order (failed items are dropped).
  results: R[];
  // How many items' fn calls threw.
  skipped: number;
  // Message of the earliest (by input order) failure, if any.
  firstError?: string;
}

// Like mapWithConcurrency, but one item's failure doesn't reject the whole
// batch — failures are skipped and counted instead. Used for fan-outs where
// partial results are far more useful than all-or-nothing (e.g. one 429'd
// conversations.info shouldn't discard every other channel's unread count).
export async function mapWithConcurrencySettled<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<SettledMapResult<R>> {
  const settled = await mapWithConcurrency(items, concurrency, async (item, i) => {
    try {
      return { ok: true as const, value: await fn(item, i) };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  const result: SettledMapResult<R> = { results: [], skipped: 0, firstError: undefined };
  for (const entry of settled) {
    if (entry.ok) {
      result.results.push(entry.value);
    } else {
      result.skipped++;
      result.firstError ??= entry.error;
    }
  }
  return result;
}
