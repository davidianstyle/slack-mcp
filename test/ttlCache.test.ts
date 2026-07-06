import { describe, expect, it, vi } from "vitest";
import { memoizeWithTtl } from "../src/utils/ttlCache.js";

describe("memoizeWithTtl", () => {
  it("only calls the underlying function once for repeated calls within the TTL", async () => {
    let calls = 0;
    let now = 0;
    const fn = memoizeWithTtl(
      async () => {
        calls++;
        return "value";
      },
      1000,
      () => now
    );

    expect(await fn()).toBe("value");
    now += 500;
    expect(await fn()).toBe("value");
    expect(calls).toBe(1);
  });

  it("refetches after the TTL has elapsed", async () => {
    let calls = 0;
    let now = 0;
    const fn = memoizeWithTtl(
      async () => {
        calls++;
        return calls;
      },
      1000,
      () => now
    );

    expect(await fn()).toBe(1);
    now += 1500;
    expect(await fn()).toBe(2);
    expect(calls).toBe(2);
  });

  it("caches forever when ttlMs is Infinity", async () => {
    let calls = 0;
    let now = 0;
    const fn = memoizeWithTtl(
      async () => {
        calls++;
        return "identity";
      },
      Infinity,
      () => now
    );

    await fn();
    now += 1e12;
    await fn();
    expect(calls).toBe(1);
  });

  it("de-dupes concurrent in-flight calls instead of firing the underlying fn twice", async () => {
    const underlying = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "x";
    });
    const fn = memoizeWithTtl(underlying, 1000);

    const [a, b] = await Promise.all([fn(), fn()]);
    expect(a).toBe("x");
    expect(b).toBe("x");
    expect(underlying).toHaveBeenCalledTimes(1);
  });
});
