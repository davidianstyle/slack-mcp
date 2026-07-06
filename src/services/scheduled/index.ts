import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { withErrorHandling } from "../../utils/errors.js";
import { validateChannelId, validateTs, clampLimit } from "../../utils/validate.js";
import { parsePostAt } from "../../utils/postAt.js";

export function registerScheduledTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const api = () => ctx.client;

  server.tool(
    "slack_schedule_message",
    "Schedule a message to be sent to a channel or thread later. post_at accepts either an " +
      "ISO 8601 date/time (e.g. '2026-07-10T15:00:00Z') or Unix epoch seconds, and is converted " +
      "to epoch seconds for Slack. Must be strictly in the future and within Slack's ~120-day " +
      "scheduling window.",
    {
      channel_id: z.string().describe("Channel ID to schedule the message in"),
      text: z.string().describe("Message text (supports Slack mrkdwn)"),
      post_at: z
        .union([z.string(), z.number()])
        .describe(
          "When to send the message: an ISO 8601 date/time string or Unix epoch seconds. " +
            "Must be in the future and no more than ~120 days out."
        ),
      thread_ts: z.string().optional().describe("Thread timestamp to schedule a reply to"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id, text, post_at, thread_ts }) => {
      validateChannelId(channel_id);
      if (thread_ts) validateTs(thread_ts, "thread_ts");
      const epochSeconds = parsePostAt(post_at);

      const res = await api().chat.scheduleMessage({
        channel: channel_id,
        text,
        post_at: epochSeconds,
        thread_ts,
      });

      return textResult({
        ok: res.ok,
        channel: res.channel,
        scheduled_message_id: res.scheduled_message_id,
        post_at: res.post_at,
      });
    })
  );

  server.tool(
    "slack_list_scheduled_messages",
    "List pending scheduled messages, optionally filtered to a single channel",
    {
      channel_id: z
        .string()
        .optional()
        .describe("Only list messages scheduled in this channel"),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("Max messages to return per page (max 999)"),
      cursor: z.string().optional().describe("Pagination cursor for next page"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id, limit, cursor }) => {
      if (channel_id) validateChannelId(channel_id);
      const clampedLimit = clampLimit(limit, { max: 999, field: "limit" });

      const res = await api().chat.scheduledMessages.list({
        channel: channel_id,
        limit: clampedLimit,
        cursor,
      });

      return textResult({
        scheduled_messages: res.scheduled_messages ?? [],
        next_cursor: res.response_metadata?.next_cursor,
      });
    })
  );

  server.tool(
    "slack_delete_scheduled_message",
    "Cancel a pending scheduled message before it's sent",
    {
      channel_id: z.string().describe("Channel ID the message was scheduled in"),
      scheduled_message_id: z
        .string()
        .describe(
          "Scheduled message ID, from slack_schedule_message or slack_list_scheduled_messages"
        ),
    },
    withErrorHandling(ctx.slug, async ({ channel_id, scheduled_message_id }) => {
      validateChannelId(channel_id);
      const res = await api().chat.deleteScheduledMessage({
        channel: channel_id,
        scheduled_message_id,
      });
      return textResult({ ok: res.ok });
    })
  );
}
