# slack-mcp
Slack MCP server for Claude Code — channels, messages, users, usergroups, and drafts.

## Authentication

Tools are gated by what tokens are available in env vars for the slug you pass with `--slug`.

| Tool group | Tokens required | Env var(s) |
|---|---|---|
| channels, conversations, users, usergroups | xoxp user token | `SLACK_TOKEN_<SLUG>` |
| drafts (drafts.create / list / edit / delete) | xoxc client token + xoxd session cookie | `SLACK_XOXC_<SLUG>` and `SLACK_XOXD_<SLUG>` |

`<SLUG>` is the workspace slug, uppercased with `-` → `_` (e.g. `doromind-slack-com` → `SLACK_TOKEN_DOROMIND_SLACK_COM`).

If `SLACK_XOXC_<SLUG>` or `SLACK_XOXD_<SLUG>` is missing, the draft tools register but throw a clear error at call time. Everything else still works on xoxp alone.

## Extracting xoxc + xoxd from your browser

Slack's drafts API isn't exposed to xoxp tokens, so you need browser-session tokens. They're tied to your logged-in browser session and rotate when you sign out.

**`xoxd` (session cookie)**

1. Open Slack in a browser (`https://<workspace>.slack.com`) and sign in.
2. Open DevTools → **Application** → **Cookies** → `https://<workspace>.slack.com`.
3. Copy the value of the `d` cookie. It starts with `xoxd-`. This is `SLACK_XOXD_<SLUG>`.

**`xoxc` (client token, via Network tab)**

The Slack web app no longer stores `xoxc` in a predictable `localStorage` key, so grab it from a live request instead. This works regardless of Slack's client storage layout.

1. DevTools → **Network** tab. Filter for `api/`.
2. Click around in Slack to trigger traffic (switch channels, send a typing indicator, etc.).
3. Click any request to `/api/<method>` (e.g. `client.counts`, `conversations.history`).
4. In the request details, find **Payload** (or **Request** → **Form Data**). Look for the field named `token` — its value starts with `xoxc-`.
5. That value is `SLACK_XOXC_<SLUG>`.

Add both to `~/.config/openbrain/.env`:

```
SLACK_XOXC_DOROMIND_SLACK_COM=xoxc-...
SLACK_XOXD_DOROMIND_SLACK_COM=xoxd-...
```

Restart Claude Code (or reload MCPs) to pick up the new env.

## Usage

```bash
slack-mcp --slug doromind-slack-com
```
