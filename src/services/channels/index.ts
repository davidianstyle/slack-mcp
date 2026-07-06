import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { withErrorHandling } from "../../utils/errors.js";
import { validateChannelId, clampLimit } from "../../utils/validate.js";
import { pruneChannelInfo } from "../../utils/pruning.js";

export function registerChannelsTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const api = () => ctx.client;

  server.tool(
    "slack_channels_list",
    "List channels in the workspace. By default (scope: 'member') this only returns channels the authenticated user is a member of. Pass scope: 'all' for a workspace-wide listing that includes channels the user hasn't joined (requires appropriate channel-read scopes).",
    {
      types: z
        .string()
        .optional()
        .default("public_channel,private_channel")
        .describe(
          "Comma-separated channel types: public_channel, private_channel, mpim, im"
        ),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("Max channels to return per page (max 999)"),
      cursor: z.string().optional().describe("Pagination cursor"),
      exclude_archived: z
        .boolean()
        .optional()
        .default(true)
        .describe("Exclude archived channels"),
      scope: z
        .enum(["member", "all"])
        .optional()
        .default("member")
        .describe(
          "'member' (default) lists channels the authenticated user belongs to (via users.conversations). 'all' lists every channel in the workspace regardless of membership (via conversations.list)."
        ),
    },
    withErrorHandling(
      ctx.slug,
      async ({ types, limit, cursor, exclude_archived, scope }) => {
        // Both conversations.list and users.conversations document limit as
        // "must be an integer under 1000".
        const clampedLimit = clampLimit(limit, { max: 999, field: "limit" });
        const res =
          scope === "all"
            ? await api().conversations.list({
                types,
                limit: clampedLimit,
                cursor,
                exclude_archived,
              })
            : await api().users.conversations({
                types,
                limit: clampedLimit,
                cursor,
                exclude_archived,
              });

        return textResult({
          channels: (res.channels || []).map((ch) => ({
            id: ch.id,
            name: ch.name,
            is_private: ch.is_private,
            is_im: ch.is_im,
            is_mpim: ch.is_mpim,
            is_archived: ch.is_archived,
            // Only conversations.list's (scope: "all") response type even
            // carries num_members, and Slack rarely populates it there
            // either — surface it when present rather than always emitting
            // an undefined placeholder.
            num_members: "num_members" in ch ? ch.num_members : undefined,
            topic: ch.topic?.value,
            purpose: ch.purpose?.value,
          })),
          next_cursor: res.response_metadata?.next_cursor,
        });
      }
    )
  );

  server.tool(
    "slack_channel_info",
    "Get a channel's metadata: name, topic, purpose, membership, and member count",
    {
      channel_id: z.string().describe("Channel ID to look up"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id }) => {
      validateChannelId(channel_id);
      const res = await api().conversations.info({
        channel: channel_id,
        include_num_members: true,
      });
      return textResult(res.channel ? pruneChannelInfo(res.channel) : {});
    })
  );

  server.tool(
    "slack_set_channel_topic",
    "Set a channel's topic",
    {
      channel_id: z.string().describe("Channel ID to update"),
      topic: z.string().describe("New topic (no formatting or linkification)"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id, topic }) => {
      validateChannelId(channel_id);
      const res = await api().conversations.setTopic({ channel: channel_id, topic });
      return textResult({ ok: res.ok, topic: res.channel?.topic?.value });
    })
  );

  server.tool(
    "slack_set_channel_purpose",
    "Set a channel's purpose",
    {
      channel_id: z.string().describe("Channel ID to update"),
      purpose: z.string().describe("New purpose"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id, purpose }) => {
      validateChannelId(channel_id);
      const res = await api().conversations.setPurpose({ channel: channel_id, purpose });
      return textResult({ ok: res.ok, purpose: res.channel?.purpose?.value });
    })
  );

  server.tool(
    "slack_list_channel_members",
    "List the member user IDs of a channel",
    {
      channel_id: z.string().describe("Channel ID to list members for"),
      limit: z
        .number()
        .optional()
        .default(200)
        .describe("Max members to return per page (max 1000)"),
      cursor: z.string().optional().describe("Pagination cursor for the next page"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id, limit, cursor }) => {
      validateChannelId(channel_id);
      const clampedLimit = clampLimit(limit, { max: 1000, field: "limit" });
      const res = await api().conversations.members({
        channel: channel_id,
        limit: clampedLimit,
        cursor,
      });
      return textResult({
        members: res.members ?? [],
        next_cursor: res.response_metadata?.next_cursor,
      });
    })
  );
}
