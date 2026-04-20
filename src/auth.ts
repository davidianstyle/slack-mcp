import { WebClient } from "@slack/web-api";

export function loadAuth(slug: string): WebClient {
  const envVar = `SLACK_TOKEN_${slug.replace(/-/g, "_").toUpperCase()}`;
  const token = process.env[envVar];

  if (!token) {
    throw new Error(
      `Environment variable ${envVar} not set.\nSet it in ~/.config/openbrain/.env or export it before running.`
    );
  }

  return new WebClient(token);
}
