import { WebClient } from "@slack/web-api";
import { BrowserApi, createBrowserApi } from "./utils/browserApi.js";

export interface SlackAuth {
  client: WebClient;
  browserApi?: BrowserApi;
}

export function loadAuth(slug: string): SlackAuth {
  const key = slug.replace(/-/g, "_").toUpperCase();
  const xoxp = process.env[`SLACK_TOKEN_${key}`];

  if (!xoxp) {
    throw new Error(
      `Environment variable SLACK_TOKEN_${key} not set.\nSet it in ~/.config/openbrain/.env or export it before running.`
    );
  }

  const client = new WebClient(xoxp);

  const xoxc = process.env[`SLACK_XOXC_${key}`];
  const xoxd = process.env[`SLACK_XOXD_${key}`];
  const browserApi =
    xoxc && xoxd ? createBrowserApi(xoxc, xoxd) : undefined;

  return { client, browserApi };
}
