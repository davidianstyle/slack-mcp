import { WebClient, type RetryOptions } from "@slack/web-api";
import { BrowserApi, createBrowserApi } from "./utils/browserApi.js";
import { envSlug } from "./utils/slug.js";

export interface SlackAuth {
  client: WebClient;
  browserApi?: BrowserApi;
  slug: string;
}

// WebClient's defaults are unbounded: retryConfig defaults to
// tenRetriesInAboutThirtyMinutes and timeout defaults to 0 (no timeout). On
// a heavily rate-limited or hung endpoint, a single tool call can then block
// for tens of minutes with no useful signal back to the caller. These bound
// both the retry budget and the per-request wall-clock time so a bad call
// fails fast with a clear error instead.
const RETRY_CONFIG: RetryOptions = {
  retries: 2,
  minTimeout: 500,
  maxTimeout: 5_000,
  maxRetryTime: 15_000,
  randomize: true,
};

const REQUEST_TIMEOUT_MS = 30_000;

export function loadAuth(slug: string): SlackAuth {
  const key = envSlug(slug);
  const xoxp = process.env[`SLACK_TOKEN_${key}`];

  if (!xoxp) {
    throw new Error(
      `Environment variable SLACK_TOKEN_${key} not set.\nSet it in ~/.config/openbrain/.env or export it before running.`
    );
  }

  const client = new WebClient(xoxp, {
    retryConfig: RETRY_CONFIG,
    timeout: REQUEST_TIMEOUT_MS,
  });

  const xoxc = process.env[`SLACK_XOXC_${key}`];
  const xoxd = process.env[`SLACK_XOXD_${key}`];
  const browserApi =
    xoxc && xoxd ? createBrowserApi(xoxc, xoxd) : undefined;

  return { client, browserApi, slug };
}
