// Pure, dependency-free validation helpers shared across tool handlers.
// These exist to turn confusing Slack API errors (or silent bad behavior)
// into a clear, actionable message before a request is ever sent.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// Slack conversation/user IDs: a type prefix (C=channel, D=DM, G=private
// channel/group DM, U=user, used e.g. as the "self" pseudo-channel) followed
// by a base-36-ish uppercase alphanumeric suffix. Real IDs are usually 9-11
// chars total; 7+ is accepted to stay permissive for older/short IDs.
const CHANNEL_ID_RE = /^[CDGU][A-Z0-9]{6,}$/;

// Slack user IDs: U (classic) or W (Enterprise Grid) followed by the same
// uppercase alphanumeric suffix as conversation IDs.
const USER_ID_RE = /^[UW][A-Z0-9]{6,}$/;

// Slack message timestamps: <unix seconds>.<6-digit fractional part>.
const TS_RE = /^\d{10}\.\d{6}$/;

export function validateChannelId(id: string): string {
  if (!CHANNEL_ID_RE.test(id)) {
    throw new ValidationError(
      `"${id}" doesn't look like a Slack channel ID (expected something like "C0123456789"). ` +
        `If you have a channel name (e.g. "#general"), use slack_channels_list to find its ID first.`
    );
  }
  return id;
}

export function validateUserId(id: string): string {
  if (!USER_ID_RE.test(id)) {
    throw new ValidationError(
      `"${id}" doesn't look like a Slack user ID (expected something like "U0123456789", or ` +
        `"W0123456789" on Enterprise Grid). If you have a name or @handle, use ` +
        `slack_users_search to find the user's ID first.`
    );
  }
  return id;
}

export function validateTs(ts: string, field = "ts"): string {
  if (!TS_RE.test(ts)) {
    throw new ValidationError(
      `"${ts}" doesn't look like a Slack timestamp for ${field} (expected format "1234567890.123456").`
    );
  }
  return ts;
}

export interface ClampLimitOptions {
  max: number;
  min?: number;
  field?: string;
}

export function clampLimit(value: number, opts: ClampLimitOptions): number {
  const { max, min = 1, field = "limit" } = opts;
  if (!Number.isInteger(value)) {
    throw new ValidationError(`${field} must be an integer, got ${value}`);
  }
  return Math.min(Math.max(value, min), max);
}

const COMMON_BLOCK_TYPES = [
  "section",
  "divider",
  "image",
  "header",
  "context",
  "actions",
  "rich_text",
  "input",
];

const BLOCK_TYPES_HINT = `Common block types: ${COMMON_BLOCK_TYPES.join(", ")}. See https://api.slack.com/reference/block-kit/blocks.`;

// Parses the `blocks` tool param (a JSON string, since MCP tool params are
// flat/scalar) into the array of block objects the Slack Web API expects.
// Only checks the outer shape (a JSON array of objects each with a string
// `type`) — full per-block-type schema validation is left to Slack's API,
// whose error responses already come back through the error mapper.
export function parseBlocksJson(json: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ValidationError(
      `blocks must be valid JSON — a JSON array of Block Kit block objects. ${BLOCK_TYPES_HINT}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new ValidationError(
      `blocks must be a JSON array of block objects, got ${typeof parsed}. ${BLOCK_TYPES_HINT}`
    );
  }

  parsed.forEach((block, i) => {
    if (typeof block !== "object" || block === null || Array.isArray(block)) {
      throw new ValidationError(
        `blocks[${i}] must be an object, got ${block === null ? "null" : typeof block}. ${BLOCK_TYPES_HINT}`
      );
    }
    if (typeof (block as Record<string, unknown>).type !== "string") {
      throw new ValidationError(
        `blocks[${i}] is missing a string "type" field. ${BLOCK_TYPES_HINT}`
      );
    }
  });

  return parsed as Record<string, unknown>[];
}
