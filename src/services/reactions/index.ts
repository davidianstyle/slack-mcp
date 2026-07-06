import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { withErrorHandling } from "../../utils/errors.js";

export function registerReactionsTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const api = () => ctx.client;

  server.tool(
    "slack_add_reaction",
    "Add an emoji reaction to a message. Name is the emoji shortcode without colons (e.g. 'white_check_mark', not ':white_check_mark:').",
    {
      channel_id: z.string().describe("Channel ID containing the message"),
      ts: z.string().describe("Timestamp of the target message"),
      name: z
        .string()
        .describe("Emoji shortcode without surrounding colons"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id, ts, name }) => {
      const emoji = name.replace(/^:|:$/g, "");
      const res = await api().reactions.add({
        channel: channel_id,
        timestamp: ts,
        name: emoji,
      });
      return textResult({ ok: res.ok });
    })
  );
}
