// Wrapper for Slack's internal client API (the same endpoints the Slack web
// client uses). Authenticated via a browser-session xoxc token (in the form
// body as `token=`) plus the `d` cookie (xoxd token). Needed for endpoints
// like drafts.* that are not exposed to xoxp user tokens.
//
// Token extraction:
//   1. Open Slack in a browser, sign in to the workspace
//   2. Open DevTools → Application → Cookies → https://<workspace>.slack.com
//   3. Copy the `d` cookie value (starts with xoxd-) → SLACK_XOXD_<SLUG>
//   4. Open DevTools → Application → Local Storage → https://<workspace>.slack.com
//      → key `localConfig_v2` → find the active team's `token` (starts with xoxc-)
//      → SLACK_XOXC_<SLUG>

export type BrowserApi = (
  method: string,
  args: Record<string, string | number | boolean | undefined>
) => Promise<Record<string, unknown>>;

// Thrown when Slack's internal API responds with `ok: false`. Kept distinct
// from generic network/HTTP errors so callers (see utils/errors.ts) can tell
// "Slack rejected this browser-session token" apart from "the request itself
// failed" and give a tailored remediation hint.
export class BrowserApiError extends Error {
  readonly slackError: string;
  readonly method: string;

  constructor(slackError: string, method: string) {
    super(`slack ${method} failed: ${slackError}`);
    this.name = "BrowserApiError";
    this.slackError = slackError;
    this.method = method;
  }
}

const REQUEST_TIMEOUT_MS = 30_000;
// Cap how long we'll wait on a Retry-After header before giving up — a
// misbehaving or hostile response could otherwise ask us to wait minutes.
const MAX_RETRY_WAIT_MS = 10_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createBrowserApi(xoxc: string, xoxd: string): BrowserApi {
  const doRequest = (
    method: string,
    args: Record<string, string | number | boolean | undefined>
  ): Promise<Response> => {
    const body = new URLSearchParams();
    body.set("token", xoxc);
    for (const [k, v] of Object.entries(args)) {
      if (v === undefined) continue;
      body.set(k, String(v));
    }
    return fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        Cookie: `d=${xoxd}`,
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  };

  return async (method, args) => {
    let res = await doRequest(method, args);

    if (res.status === 429) {
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      const waitMs = Number.isFinite(retryAfterSec)
        ? Math.min(retryAfterSec * 1000, MAX_RETRY_WAIT_MS)
        : MAX_RETRY_WAIT_MS;
      await wait(waitMs);
      res = await doRequest(method, args);
    }

    if (!res.ok) {
      throw new Error(`slack ${method} failed: HTTP ${res.status} ${res.statusText}`);
    }

    let json: Record<string, unknown>;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new Error(`slack ${method} failed: response was not valid JSON`);
    }

    if (!json.ok) {
      const err = typeof json.error === "string" ? json.error : "unknown_error";
      throw new BrowserApiError(err, method);
    }
    return json;
  };
}
