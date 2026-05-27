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

export function createBrowserApi(xoxc: string, xoxd: string): BrowserApi {
  return async (method, args) => {
    const body = new URLSearchParams();
    body.set("token", xoxc);
    for (const [k, v] of Object.entries(args)) {
      if (v === undefined) continue;
      body.set(k, String(v));
    }
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        Cookie: `d=${xoxd}`,
      },
      body,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!json.ok) {
      const err = typeof json.error === "string" ? json.error : "unknown_error";
      throw new Error(`slack ${method} failed: ${err}`);
    }
    return json;
  };
}
