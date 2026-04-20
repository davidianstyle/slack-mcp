import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";

export function registerConversationsTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const api = () => ctx.client;

  server.tool(
    "slack_conversations_history",
    "Get recent messages from a channel or DM",
    {
      channel_id: z.string().describe("Channel or DM ID"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Number of messages to return (max 200)"),
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor for next page"),
      oldest: z
        .string()
        .optional()
        .describe("Only messages after this Unix timestamp"),
      latest: z
        .string()
        .optional()
        .describe("Only messages before this Unix timestamp"),
    },
    async ({ channel_id, limit, cursor, oldest, latest }) => {
      const res = await api().conversations.history({
        channel: channel_id,
        limit: Math.min(limit, 200),
        cursor,
        oldest,
        latest,
      });
      return textResult({
        messages: res.messages,
        has_more: res.has_more,
        next_cursor: res.response_metadata?.next_cursor,
      });
    }
  );

  server.tool(
    "slack_conversations_replies",
    "Get replies in a message thread",
    {
      channel_id: z.string().describe("Channel ID containing the thread"),
      thread_ts: z.string().describe("Timestamp of the parent message"),
      limit: z.number().optional().default(50).describe("Max replies to return"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    async ({ channel_id, thread_ts, limit, cursor }) => {
      const res = await api().conversations.replies({
        channel: channel_id,
        ts: thread_ts,
        limit,
        cursor,
      });
      return textResult({
        messages: res.messages,
        has_more: res.has_more,
        next_cursor: res.response_metadata?.next_cursor,
      });
    }
  );

  server.tool(
    "slack_conversations_add_message",
    "Post a message to a channel or thread",
    {
      channel_id: z.string().describe("Channel ID to post to"),
      text: z.string().describe("Message text (supports Slack mrkdwn)"),
      thread_ts: z
        .string()
        .optional()
        .describe("Thread timestamp to reply to"),
    },
    async ({ channel_id, text, thread_ts }) => {
      const res = await api().chat.postMessage({
        channel: channel_id,
        text,
        thread_ts,
      });
      return textResult({
        ok: res.ok,
        channel: res.channel,
        ts: res.ts,
        message: res.message,
      });
    }
  );

  server.tool(
    "slack_conversations_search_messages",
    "Search messages across the workspace",
    {
      query: z.string().describe("Search query (supports Slack search syntax)"),
      count: z.number().optional().default(20).describe("Number of results"),
      sort: z
        .enum(["score", "timestamp"])
        .optional()
        .default("score")
        .describe("Sort order"),
      sort_dir: z
        .enum(["asc", "desc"])
        .optional()
        .default("desc")
        .describe("Sort direction"),
    },
    async ({ query, count, sort, sort_dir }) => {
      const res = await api().search.messages({
        query,
        count,
        sort,
        sort_dir,
      });
      return textResult({
        total: res.messages?.total,
        matches: res.messages?.matches,
      });
    }
  );

  server.tool(
    "slack_conversations_unreads",
    "Get channels and DMs with unread messages",
    {
      types: z
        .string()
        .optional()
        .default("public_channel,private_channel,mpim,im")
        .describe("Comma-separated channel types to include"),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("Max channels to scan"),
    },
    async ({ types, limit }) => {
      const res = await api().users.conversations({
        types,
        limit,
        exclude_archived: true,
      });

      const unreads = [];
      for (const ch of res.channels || []) {
        if (!ch.id) continue;
        const info = await api().conversations.info({ channel: ch.id });
        const unreadCount =
          (info.channel as Record<string, unknown> | undefined)?.unread_count as
            | number
            | undefined ?? 0;
        if (unreadCount > 0) {
          unreads.push({
            id: ch.id,
            name: ch.name || ch.id,
            is_im: ch.is_im,
            is_mpim: ch.is_mpim,
            unread_count: unreadCount,
          });
        }
      }

      return textResult(
        unreads.sort((a, b) => b.unread_count - a.unread_count)
      );
    }
  );

  server.tool(
    "slack_conversations_mark",
    "Mark a channel or DM as read up to a given timestamp",
    {
      channel_id: z.string().describe("Channel ID to mark"),
      ts: z.string().describe("Timestamp to mark as read up to"),
    },
    async ({ channel_id, ts }) => {
      const res = await api().conversations.mark({ channel: channel_id, ts });
      return textResult({ ok: res.ok });
    }
  );
}
