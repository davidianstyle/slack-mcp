import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/utils/validate.js";
import { parsePostAt, MAX_SCHEDULE_WINDOW_SECONDS } from "../src/utils/postAt.js";

// Fixed "now" for deterministic tests: 2024-01-01T00:00:00Z.
const NOW_MS = Date.parse("2024-01-01T00:00:00Z");
const now = () => NOW_MS;
const nowSeconds = Math.floor(NOW_MS / 1000);

describe("parsePostAt", () => {
  it("converts a future ISO 8601 string to epoch seconds", () => {
    expect(parsePostAt("2024-01-02T00:00:00Z", now)).toBe(nowSeconds + 86400);
  });

  it("accepts an epoch-seconds number directly", () => {
    expect(parsePostAt(nowSeconds + 3600, now)).toBe(nowSeconds + 3600);
  });

  it("rounds a fractional epoch-seconds number to the nearest integer", () => {
    expect(parsePostAt(nowSeconds + 3600.7, now)).toBe(nowSeconds + 3601);
  });

  it("accepts an epoch-seconds numeric string", () => {
    expect(parsePostAt(String(nowSeconds + 3600), now)).toBe(nowSeconds + 3600);
  });

  it("throws ValidationError when post_at is in the past", () => {
    expect(() => parsePostAt("2023-12-31T00:00:00Z", now)).toThrow(ValidationError);
  });

  it("throws ValidationError when post_at equals now (not strictly future)", () => {
    expect(() => parsePostAt(nowSeconds, now)).toThrow(ValidationError);
  });

  it("throws ValidationError when post_at is beyond the ~120-day window", () => {
    const tooFar = nowSeconds + MAX_SCHEDULE_WINDOW_SECONDS + 3600;
    expect(() => parsePostAt(tooFar, now)).toThrow(ValidationError);
  });

  it("accepts post_at right at the edge of the scheduling window", () => {
    const edge = nowSeconds + MAX_SCHEDULE_WINDOW_SECONDS;
    expect(parsePostAt(edge, now)).toBe(edge);
  });

  it("throws ValidationError for an unparseable string", () => {
    expect(() => parsePostAt("not-a-date", now)).toThrow(ValidationError);
  });

  it("throws ValidationError for a non-finite number", () => {
    expect(() => parsePostAt(Infinity, now)).toThrow(ValidationError);
  });

  it("includes an ISO timestamp in the past-post_at error message", () => {
    try {
      parsePostAt("2023-12-31T00:00:00Z", now);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as Error).message).toMatch(/2023-12-31/);
    }
  });
});
