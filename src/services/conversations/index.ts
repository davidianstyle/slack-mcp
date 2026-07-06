import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { withErrorHandling } from "../../utils/errors.js";
import { validateChannelId, validateTs, clampLimit } from "../../utils/validate.js";
import { pruneMessages } from "../../utils/pruning.js";
import { mapWithConcurrency } from "../../utils/concurrency.js";

const INCLUDE_RAW_DESCRIPTION =
  "Return full, unpruned message objects instead of the compact default (ts, user, text, thread_ts, reply_count, reactions, subtype, file names). Use this if you need attachments, blocks, or other fields the compact form drops.";

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
      include_raw: z.boolean().optional().default(false).describe(INCLUDE_RAW_DESCRIPTION),
    },
    withErrorHandling(
      ctx.slug,
      async ({ channel_id, limit, cursor, oldest, latest, include_raw }) => {
        validateChannelId(channel_id);
        const clampedLimit = clampLimit(limit, { max: 200, field: "limit" });
        const res = await api().conversations.history({
          channel: channel_id,
          limit: clampedLimit,
          cursor,
          oldest,
          latest,
        });
        const messages = res.messages ?? [];
        return textResult({
          messages: include_raw ? messages : pruneMessages(messages),
          has_more: res.has_more,
          next_cursor: res.response_metadata?.next_cursor,
        });
      }
    )
  );

  server.tool(
    "slack_conversations_replies",
    "Get replies in a message thread",
    {
      channel_id: z.string().describe("Channel ID containing the thread"),
      thread_ts: z.string().describe("Timestamp of the parent message"),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Max replies to return (max 200)"),
      cursor: z.string().optional().describe("Pagination cursor"),
      include_raw: z.boolean().optional().default(false).describe(INCLUDE_RAW_DESCRIPTION),
    },
    withErrorHandling(
      ctx.slug,
      async ({ channel_id, thread_ts, limit, cursor, include_raw }) => {
        validateChannelId(channel_id);
        validateTs(thread_ts, "thread_ts");
        const clampedLimit = clampLimit(limit, { max: 200, field: "limit" });
        const res = await api().conversations.replies({
          channel: channel_id,
          ts: thread_ts,
          limit: clampedLimit,
          cursor,
        });
        const messages = res.messages ?? [];
        return textResult({
          messages: include_raw ? messages : pruneMessages(messages),
          has_more: res.has_more,
          next_cursor: res.response_metadata?.next_cursor,
        });
      }
    )
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
    withErrorHandling(ctx.slug, async ({ channel_id, text, thread_ts }) => {
      validateChannelId(channel_id);
      if (thread_ts) validateTs(thread_ts, "thread_ts");
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
    })
  );

  server.tool(
    "slack_conversations_edit_message",
    "Edit a previously sent message",
    {
      channel_id: z.string().describe("Channel ID containing the message"),
      ts: z.string().describe("Timestamp of the message to edit"),
      text: z.string().describe("New message text (supports Slack mrkdwn)"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id, ts, text }) => {
      validateChannelId(channel_id);
      validateTs(ts);
      const res = await api().chat.update({
        channel: channel_id,
        ts,
        text,
      });
      return textResult({
        ok: res.ok,
        channel: res.channel,
        ts: res.ts,
        message: res.message,
      });
    })
  );

  server.tool(
    "slack_conversations_search_messages",
    "Search messages across the workspace",
    {
      query: z.string().describe("Search query (supports Slack search syntax)"),
      count: z.number().optional().default(20).describe("Number of results per page"),
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
      page: z
        .number()
        .optional()
        .describe(
          "Page number of results to return (1-indexed, default 1). search.messages paginates by page rather than cursor — use the returned 'paging' metadata to know how many pages exist."
        ),
    },
    withErrorHandling(ctx.slug, async ({ query, count, sort, sort_dir, page }) => {
      const res = await api().search.messages({
        query,
        count,
        sort,
        sort_dir,
        page,
      });
      return textResult({
        total: res.messages?.total,
        matches: res.messages?.matches,
        paging: res.messages?.paging,
      });
    })
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
        .describe("Max channels to scan across all pages"),
    },
    withErrorHandling(ctx.slug, async ({ types, limit }) => {
      const clampedLimit = clampLimit(limit, { max: 2000, field: "limit" });

      // users.conversations only returns up to `limit` per page (Slack API
      // limit param is a per-page size, not a total), so loop the cursor
      // until either the workspace is exhausted or we've scanned enough
      // channels to satisfy the caller's `limit`.
      const channels: Array<{
        id?: string;
        name?: string;
        is_im?: boolean;
        is_mpim?: boolean;
      }> = [];
      let cursor: string | undefined;
      do {
        const pageSize = Math.min(200, clampedLimit - channels.length);
        const res = await api().users.conversations({
          types,
          limit: pageSize,
          cursor,
          exclude_archived: true,
        });
        const page = res.channels || [];
        channels.push(...page);
        cursor = res.response_metadata?.next_cursor || undefined;
        // Guard against a degenerate response (empty page with a truthy
        // next_cursor) spinning this loop forever.
        if (page.length === 0) break;
      } while (cursor && channels.length < clampedLimit);

      const channelsWithIds = channels.filter(
        (ch): ch is typeof ch & { id: string } => !!ch.id
      );

      const unreads = await mapWithConcurrency(channelsWithIds, 8, async (ch) => {
        const info = await api().conversations.info({ channel: ch.id });
        const unreadCount =
          (info.channel as Record<string, unknown> | undefined)?.unread_count as
            | number
            | undefined ?? 0;
        return {
          id: ch.id,
          name: ch.name || ch.id,
          is_im: ch.is_im,
          is_mpim: ch.is_mpim,
          unread_count: unreadCount,
        };
      });

      return textResult(
        unreads
          .filter((u) => u.unread_count > 0)
          .sort((a, b) => b.unread_count - a.unread_count)
      );
    })
  );

  server.tool(
    "slack_my_mentions",
    "Find recent messages that mention the authenticated user (works across channel top-level posts and thread replies, regardless of read state). Use this to catch @mentions that slack_conversations_unreads misses — that tool only returns channels with top-level unreads, so it skips thread mentions and mentions in already-read channels.",
    {
      hours: z
        .number()
        .optional()
        .default(24)
        .describe("Look back this many hours (used to compute the search 'after:' date filter)"),
      count: z
        .number()
        .optional()
        .default(20)
        .describe("Max results to return per page"),
      page: z
        .number()
        .optional()
        .describe(
          "Page number of results to return (1-indexed, default 1). search.messages paginates by page rather than cursor — use the returned 'paging' metadata to know how many pages exist."
        ),
    },
    withErrorHandling(ctx.slug, async ({ hours, count, page }) => {
      const userId = await ctx.getMyUserId();

      // Slack search 'after:' takes YYYY-MM-DD. Compute the date floor from `hours` ago.
      const floorMs = Date.now() - hours * 3600 * 1000;
      const after = new Date(floorMs).toISOString().slice(0, 10);
      const query = `<@${userId}> after:${after}`;

      const res = await api().search.messages({
        query,
        count,
        sort: "timestamp",
        sort_dir: "desc",
        page,
      });

      return textResult({
        user_id: userId,
        query,
        total: res.messages?.total,
        matches: res.messages?.matches,
        paging: res.messages?.paging,
      });
    })
  );

  server.tool(
    "slack_conversations_open",
    "Open or resume a direct message or multi-party DM. Returns the channel ID for messaging.",
    {
      users: z
        .string()
        .describe(
          "Comma-separated list of user IDs (1 for DM, 2+ for group DM)"
        ),
    },
    withErrorHandling(ctx.slug, async ({ users }) => {
      const res = await api().conversations.open({
        users,
        return_im: true,
      });
      return textResult({
        ok: res.ok,
        channel: res.channel?.id,
        already_open: res.already_open,
      });
    })
  );

  server.tool(
    "slack_conversations_mark",
    "Mark a channel or DM as read up to a given timestamp",
    {
      channel_id: z.string().describe("Channel ID to mark"),
      ts: z.string().describe("Timestamp to mark as read up to"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id, ts }) => {
      validateChannelId(channel_id);
      validateTs(ts);
      const res = await api().conversations.mark({ channel: channel_id, ts });
      return textResult({ ok: res.ok });
    })
  );
}
