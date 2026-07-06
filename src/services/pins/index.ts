import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { withErrorHandling } from "../../utils/errors.js";
import { validateChannelId, validateTs } from "../../utils/validate.js";
import { prunePinnedItems, type PinnedItemSource } from "../../utils/pruning.js";

export function registerPinsTools(server: McpServer, ctx: ServiceContext): void {
  const api = () => ctx.client;

  server.tool(
    "slack_pin_message",
    "Pin a message to its channel",
    {
      channel_id: z.string().describe("Channel ID containing the message"),
      ts: z.string().describe("Timestamp of the message to pin"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id, ts }) => {
      validateChannelId(channel_id);
      validateTs(ts);
      const res = await api().pins.add({ channel: channel_id, timestamp: ts });
      return textResult({ ok: res.ok });
    })
  );

  server.tool(
    "slack_unpin_message",
    "Remove a pinned message from its channel",
    {
      channel_id: z.string().describe("Channel ID containing the message"),
      ts: z.string().describe("Timestamp of the message to unpin"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id, ts }) => {
      validateChannelId(channel_id);
      validateTs(ts);
      const res = await api().pins.remove({ channel: channel_id, timestamp: ts });
      return textResult({ ok: res.ok });
    })
  );

  server.tool(
    "slack_list_pins",
    "List items pinned to a channel",
    {
      channel_id: z.string().describe("Channel ID to list pins for"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id }) => {
      validateChannelId(channel_id);
      const res = await api().pins.list({ channel: channel_id });
      const items = (res.items ?? []) as unknown as PinnedItemSource[];
      return textResult({ items: prunePinnedItems(items) });
    })
  );
}
