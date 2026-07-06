import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../src/utils/concurrency.js";

describe("mapWithConcurrency", () => {
  it("maps every item and preserves input order in the output", async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("never runs more than `concurrency` tasks at once", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapWithConcurrency(items, 4, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return n;
    });

    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it("returns an empty array for empty input", async () => {
    const result = await mapWithConcurrency([], 4, async (n: number) => n);
    expect(result).toEqual([]);
  });

  it("propagates a rejection from any task", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      })
    ).rejects.toThrow("boom");
  });

  it("handles concurrency higher than the item count", async () => {
    const result = await mapWithConcurrency([1, 2], 8, async (n) => n + 1);
    expect(result).toEqual([2, 3]);
  });
});
