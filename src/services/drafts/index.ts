import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";

export function registerDraftsTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const api = () => ctx.client;

  server.tool(
    "slack_drafts_list",
    "List draft messages saved in Slack",
    {
      count: z
        .number()
        .optional()
        .default(20)
        .describe("Number of drafts to return"),
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor for next page"),
    },
    async ({ count, cursor }) => {
      const res = await api().apiCall("drafts.list", {
        count,
        cursor,
      });
      return textResult(res);
    }
  );

  server.tool(
    "slack_drafts_create",
    "Create a draft message in a channel or thread (appears in Slack's Drafts section)",
    {
      channel_id: z.string().describe("Channel or DM ID to draft the message in"),
      text: z.string().describe("Draft message text (supports Slack mrkdwn)"),
      thread_ts: z
        .string()
        .optional()
        .describe("Thread timestamp to draft a reply to"),
    },
    async ({ channel_id, text, thread_ts }) => {
      const res = await api().apiCall("drafts.create", {
        type: "channel",
        channel: channel_id,
        text,
        ...(thread_ts && { thread_ts }),
      });
      return textResult(res);
    }
  );

  server.tool(
    "slack_drafts_edit",
    "Edit an existing draft message",
    {
      draft_id: z.string().describe("ID of the draft to edit"),
      channel_id: z.string().describe("Channel or DM ID the draft is in"),
      text: z.string().describe("Updated draft text (supports Slack mrkdwn)"),
      thread_ts: z
        .string()
        .optional()
        .describe("Thread timestamp if draft is a reply"),
    },
    async ({ draft_id, channel_id, text, thread_ts }) => {
      const res = await api().apiCall("drafts.editMessage", {
        id: draft_id,
        type: "channel",
        channel: channel_id,
        text,
        ...(thread_ts && { thread_ts }),
      });
      return textResult(res);
    }
  );

  server.tool(
    "slack_drafts_delete",
    "Delete a draft message",
    {
      draft_id: z.string().describe("ID of the draft to delete"),
    },
    async ({ draft_id }) => {
      const res = await api().apiCall("drafts.delete", {
        id: draft_id,
      });
      return textResult(res);
    }
  );
}
