import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { withErrorHandling } from "../../utils/errors.js";

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
        .describe("Max channels to return"),
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
        const res =
          scope === "all"
            ? await api().conversations.list({
                types,
                limit,
                cursor,
                exclude_archived,
              })
            : await api().users.conversations({
                types,
                limit,
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
}
