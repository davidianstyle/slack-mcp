import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";

export function registerChannelsTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const api = () => ctx.client;

  server.tool(
    "channels_list",
    "List channels in the workspace",
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
    },
    async ({ types, limit, cursor, exclude_archived }) => {
      const res = await api().users.conversations({
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
          num_members: (ch as Record<string, unknown>).num_members,
          topic: ch.topic?.value,
          purpose: ch.purpose?.value,
        })),
        next_cursor: res.response_metadata?.next_cursor,
      });
    }
  );
}
