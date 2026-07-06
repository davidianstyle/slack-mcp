import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { withErrorHandling } from "../../utils/errors.js";

export function registerStatusTools(server: McpServer, ctx: ServiceContext): void {
  const api = () => ctx.client;

  server.tool(
    "slack_set_status",
    "Set the authenticated user's custom status (text + emoji), optionally auto-clearing it later",
    {
      status_text: z
        .string()
        .describe("Status text to display (max 100 characters). Pass an empty string to clear it."),
      status_emoji: z
        .string()
        .optional()
        .describe("Emoji shortcode with colons, e.g. ':palm_tree:'"),
      expiration: z
        .number()
        .optional()
        .describe("Unix timestamp when the status should auto-clear. Omit for no expiration."),
    },
    withErrorHandling(ctx.slug, async ({ status_text, status_emoji, expiration }) => {
      const res = await api().users.profile.set({
        profile: {
          status_text,
          status_emoji,
          status_expiration: expiration,
        },
      });
      return textResult({ ok: res.ok });
    })
  );

  server.tool(
    "slack_set_presence",
    "Set the authenticated user's presence",
    {
      presence: z.enum(["auto", "away"]).describe("'auto' lets Slack infer activity; 'away' forces away"),
    },
    withErrorHandling(ctx.slug, async ({ presence }) => {
      const res = await api().users.setPresence({ presence });
      return textResult({ ok: res.ok });
    })
  );
}
