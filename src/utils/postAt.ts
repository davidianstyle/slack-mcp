// Pure conversion/validation for chat.scheduleMessage's `post_at` argument.
// Slack's API wants an integer Unix epoch-seconds value, but that's an
// awkward thing to ask a model to produce reliably — this accepts either an
// ISO 8601 date/time string or an epoch-seconds number/numeric-string and
// turns confusing downstream Slack errors (`time_in_past`, `invalid_time`)
// into a clear, actionable message before the request is ever sent.

import { ValidationError } from "./validate.js";

// Slack only accepts a post_at up to ~120 days in the future.
// (https://docs.slack.dev/reference/methods/chat.scheduleMessage)
export const MAX_SCHEDULE_WINDOW_SECONDS = 120 * 24 * 60 * 60;

const NUMERIC_STRING_RE = /^\d+$/;

export function parsePostAt(
  input: string | number,
  now: () => number = Date.now
): number {
  const epochSeconds = toEpochSeconds(input);
  const nowSeconds = Math.floor(now() / 1000);

  if (epochSeconds <= nowSeconds) {
    throw new ValidationError(
      `post_at (${new Date(epochSeconds * 1000).toISOString()}) must be in the future ` +
        `(current time is ${new Date(nowSeconds * 1000).toISOString()}).`
    );
  }

  if (epochSeconds - nowSeconds > MAX_SCHEDULE_WINDOW_SECONDS) {
    throw new ValidationError(
      `post_at (${new Date(epochSeconds * 1000).toISOString()}) is too far in the future — ` +
        `Slack only allows scheduling messages up to ~120 days ahead.`
    );
  }

  return epochSeconds;
}

function toEpochSeconds(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new ValidationError(`post_at must be a finite number, got ${input}`);
    }
    return Math.round(input);
  }

  const trimmed = input.trim();

  // A bare integer string is treated as epoch seconds, not an ISO date.
  if (NUMERIC_STRING_RE.test(trimmed)) {
    return Math.round(Number(trimmed));
  }

  const parsedMs = Date.parse(trimmed);
  if (Number.isNaN(parsedMs)) {
    throw new ValidationError(
      `post_at "${input}" isn't a valid ISO 8601 date/time or epoch-seconds value.`
    );
  }
  return Math.round(parsedMs / 1000);
}
